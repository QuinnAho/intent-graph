export interface User {
  id: string;
  role: 'admin' | 'member';
}

export interface Store {
  remove(projectId: string): void;
}

export function deleteProject(user: User, projectId: string, store: Store): void {
  if (user.role !== 'admin') {
    console.warn('non-admin delete', user.id);
  }
  store.remove(projectId);
}
