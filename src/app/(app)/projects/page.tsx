"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, FolderPlusIcon, FileIcon, MessagesSquareIcon } from "lucide-react";
import { getDataService } from "@/lib/data";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, EmptyState } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { toast } from "sonner";

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getDataService().listProjects(),
  });

  const create = async () => {
    if (!name.trim()) return;
    await getDataService().saveProject({ name: name.trim(), description });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    setCreateOpen(false);
    setName("");
    setDescription("");
    toast.success("项目已创建");
  };

  return (
    <PageContainer wide>
      <PageHeader
        title="项目"
        description="用项目组织会话，共享文件与专属指令"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <FolderPlusIcon /> 新建项目
          </Button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderIcon />}
          title="还没有项目"
          description="项目里的会话共享同一组文件和自定义指令，适合长期进行的工作。"
          action={<Button onClick={() => setCreateOpen(true)}>创建第一个项目</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <Link href={`/projects/${p.id}`}>
                <Card className="group h-full p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <span
                    className="mb-3 flex size-10 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: p.color ?? "#C96442" }}
                  >
                    <FolderIcon className="size-5" />
                  </span>
                  <h3 className="font-medium">{p.name}</h3>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessagesSquareIcon className="size-3.5" />
                      {p.conversationCount} 个会话
                    </span>
                    <span className="flex items-center gap-1">
                      <FileIcon className="size-3.5" />
                      {p.files.length} 个文件
                    </span>
                    <span className="ml-auto">{formatRelativeTime(p.updatedAt)}</span>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="项目名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="项目描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={create} disabled={!name.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
