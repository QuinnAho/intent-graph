export interface User {
  id: string;
  role: 'admin' | 'member';
}

export interface Store {
  remove(projectId: string): void;
}

export function deleteProject(
  user: User,
  projectId: string,
  store: Store,
): void {
  if (user.role !== "admin") { throw new Error("only admins can delete a project") }
  store.remove(projectId)
}
