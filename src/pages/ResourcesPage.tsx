import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Plus, Search, Upload, FileText, Image, File, Trash2, Download, X, Tag } from "lucide-react";
import { toast } from "sonner";

type Resource = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string | null;
  tags: string[];
  subject: string | null;
  created_at: string;
};

const FILE_ICONS: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "image/": Image,
};

function getFileIcon(type: string | null) {
  if (!type) return File;
  for (const [key, icon] of Object.entries(FILE_ICONS)) {
    if (type.startsWith(key)) return icon;
  }
  return File;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function ResourcesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", subject: "", tags: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Resource[];
    },
    enabled: !!user,
  });

  // Collect all unique tags
  const allTags = [...new Set(resources.flatMap((r) => r.tags))].sort();

  // Filter resources
  const filtered = resources.filter((r) => {
    const matchesSearch =
      !searchQuery ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTag = !filterTag || r.tags.includes(filterTag);
    return matchesSearch && matchesTag;
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !user) throw new Error("Missing file");
      setUploading(true);

      const filePath = `${user.id}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("study-materials")
        .upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { error: insertError } = await supabase.from("resources").insert({
        user_id: user.id,
        title: form.title || selectedFile.name,
        description: form.description || null,
        file_name: selectedFile.name,
        file_path: filePath,
        file_size: selectedFile.size,
        file_type: selectedFile.type || null,
        tags,
        subject: form.subject || null,
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      setDialogOpen(false);
      setForm({ title: "", description: "", subject: "", tags: "" });
      setSelectedFile(null);
      toast.success("Resource uploaded");
    },
    onError: (e) => {
      toast.error("Upload failed: " + e.message);
    },
    onSettled: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (resource: Resource) => {
      const { error: storageError } = await supabase.storage
        .from("study-materials")
        .remove([resource.file_path]);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase.from("resources").delete().eq("id", resource.id);
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Resource deleted");
    },
  });

  const handleDownload = async (resource: Resource) => {
    const { data, error } = await supabase.storage
      .from("study-materials")
      .createSignedUrl(resource.file_path, 60);
    if (error || !data?.signedUrl) return toast.error("Download failed");
    window.open(data.signedUrl, "_blank");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return toast.error("Please select a file");
    uploadMutation.mutate();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast.error("File must be under 20MB");
    setSelectedFile(file);
    if (!form.title) setForm((f) => ({ ...f, title: file.name.replace(/\.[^.]+$/, "") }));
  };

  const IconForResource = (r: Resource) => getFileIcon(r.file_type);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Resources</h1>
            <p className="text-muted-foreground text-sm mt-1">Upload and organize study materials</p>
          </div>
          <Button onClick={() => { setForm({ title: "", description: "", subject: "", tags: "" }); setSelectedFile(null); setDialogOpen(true); }} className="gradient-hero text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" /> Upload
          </Button>
        </div>

        {/* Search & filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, subject, or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Badge
              variant={filterTag === null ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilterTag(null)}
            >
              All
            </Badge>
            {allTags.map((tag) => (
              <Badge
                key={tag}
                variant={filterTag === tag ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              >
                <Tag className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Resource grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((resource) => {
              const FileIcon = getFileIcon(resource.file_type);
              return (
                <Card key={resource.id} className="border-border hover:shadow-sm transition-shadow group">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-muted p-2.5 shrink-0">
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{resource.title}</p>
                        <p className="text-xs text-muted-foreground">{formatSize(resource.file_size)}</p>
                      </div>
                    </div>

                    {resource.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{resource.description}</p>
                    )}

                    {resource.subject && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Subject:</span> {resource.subject}
                      </p>
                    )}

                    {resource.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {resource.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(resource.created_at), "MMM d, yyyy")}
                      </p>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(resource)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(resource)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery || filterTag ? "No resources match your search." : "No resources yet. Upload your first study material!"}
            </p>
          </div>
        )}

        {/* Upload Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Upload Resource</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* File picker */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  selectedFile ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.jpg,.jpeg,.png,.gif,.zip" />
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Click to select a file (max 20MB)</p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Resource title" />
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
              </div>

              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. lecture notes, chapter 5, midterm" />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes..." rows={2} />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
