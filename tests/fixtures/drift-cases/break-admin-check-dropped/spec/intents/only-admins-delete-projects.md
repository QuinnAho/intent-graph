---
id: intent-only-admins-delete-projects
title: Only admins can delete a project
parent: null
confidence: asserted
realized_by:
  - src/projects.ts#deleteProject
---

# Only admins can delete a project

Only a user with the admin role can delete a project. A member who tries gets an error and nothing is removed.
