/**
 * Seed content for a brand-new workspace. Deliberately tiny: one welcome page
 * that doubles as an editor demo, plus two example pages so the hierarchy and
 * [[links]] are visible on first run.
 */
import type { Block, Page, Task } from "./types";
import { newBlock, newPage, newTask } from "./types";
import { uid } from "./util";

export interface SeedResult {
  pages: Page[];
  blocks: Block[];
  tasks: Task[];
  /** First page id to open after onboarding. */
  homePageId: string;
}

export function seedWorkspace(workspaceId: string): SeedResult {
  const now = Date.now();

  const welcome = newPage(workspaceId, "Welcome to Locus", null);
  welcome.id = "seed-welcome";
  welcome.createdAt = now;
  welcome.updatedAt = now;
  welcome.order = 0;

  const projects = newPage(workspaceId, "Projects", welcome.id);
  projects.id = "seed-projects";
  projects.createdAt = now;
  projects.updatedAt = now;
  projects.order = 1;

  const personal = newPage(workspaceId, "Personal", welcome.id);
  personal.id = "seed-personal";
  personal.createdAt = now;
  personal.updatedAt = now;
  personal.order = 2;

  const B = (type: Parameters<typeof newBlock>[1], content = ""): Block => {
    const b = newBlock(welcome.id, type, content);
    b.id = uid();
    b.createdAt = now;
    b.updatedAt = now;
    return b;
  };

  const blocks: Block[] = [
    B("heading1", "Welcome to Locus"),
    (() => {
      const text =
        "This is your private workspace. Everything you create here is stored locally on this device — no account, no cloud, no AI. Close this tab and your work is still here.";
      const b = B("paragraph", text);
      const i = text.indexOf("private workspace");
      const j = text.indexOf("no account, no cloud, no AI");
      const rich = [];
      if (i >= 0) rich.push({ from: i, to: i + "private workspace".length, bold: true });
      if (j >= 0) rich.push({ from: j, to: j + "no account, no cloud, no AI".length, italic: true });
      b.rich = rich;
      return b;
    })(),
    B("divider"),
    B("heading2", "A quick tour"),
    B("todoList", "Press / anywhere to open the command menu and add a block"),
    B("todoList", "Create your first page with the button in the sidebar"),
    B("todoList", "Add a task from the Tasks page"),
    B("todoList", "Keep a backup: Settings → Export workspace"),
    B("quote", "Your data stays on your device."),
    B("heading2", "Linking pages"),
    B("paragraph", "Type [[Projects]] or [[Personal]] in any block to link another page. Locus finds the links for you and shows where each page is linked from."),
    B("code", "locus/\n  welcome-to-locus/\n    projects\n    personal\n\nEverything above lives on this device."),
    B("heading2", "Shortcuts"),
    B("bulletList", "Ctrl/⌘ K — search everything"),
    B("bulletList", "Type / in the editor for block commands"),
    B("bulletList", "Ctrl/⌘ D — duplicate the current page"),
    B("bulletList", "Delete a page anytime; Locus asks first"),
  ];

  const projBlock = newBlock(projects.id, "heading1", "Projects");
  projBlock.id = "seed-projects-h";
  projBlock.createdAt = now;
  projBlock.updatedAt = now;
  const projBlock2 = newBlock(projects.id, "paragraph", "Nest pages under this one to organize projects. Drag pages in the sidebar to move them.");
  projBlock2.id = "seed-projects-p";
  projBlock2.createdAt = now;
  projBlock2.updatedAt = now;

  const persBlock = newBlock(personal.id, "heading1", "Personal");
  persBlock.id = "seed-personal-h";
  persBlock.createdAt = now;
  persBlock.updatedAt = now;

  const task = newTask(workspaceId, "Take a tour of Locus", welcome.id);
  task.id = "seed-task-tour";
  task.notes = "Open the Welcome page and try a few blocks.";
  task.tags = ["welcome"];
  task.createdAt = now;
  task.updatedAt = now;

  return {
    pages: [welcome, projects, personal],
    blocks: [...blocks, projBlock, projBlock2, persBlock],
    tasks: [task],
    homePageId: welcome.id,
  };
}
