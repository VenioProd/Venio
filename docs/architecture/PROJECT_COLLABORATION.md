# Project collaboration API

VENIO-2 adds explicit, server-enforced collaboration grants for the client project portal. It uses the browser's existing `venio_session` cookie; it does not create a public share link, send an email, or dispatch a notification.

## Roles

The project `client` is the implicit `OWNER`. `ProjectMember` records grant an active `CLIENT` user one of two roles:

- `VIEWER` may read the project, visible Gantt/content sections, comments, documents, task progress, and activity. Viewer reads have no tracking writes.
- `EDITOR` has all viewer access and may add project comments or mark comments as read.

Only the owner can add, change, list, or revoke collaborators. Editors cannot manage access. The access resolver queries `ProjectMember` for every request, so deleting a member revokes access immediately. Requests without access return `404` to avoid revealing another project's existence.

## Endpoints

All endpoints are under `/api/projects/:projectId` and require a `CLIENT` session.

| Method | Path | Required role | Contract |
| --- | --- | --- | --- |
| `GET` | `/collaborators` | owner | Lists collaborators with their role and minimal user profile. |
| `POST` | `/collaborators` | owner | Body: `{ "userId": "<ObjectId>", "role": "VIEWER" | "EDITOR" }`. Returns `201`. |
| `PATCH` | `/collaborators/:memberId` | owner | Body: `{ "role": "VIEWER" | "EDITOR" }`. |
| `DELETE` | `/collaborators/:memberId` | owner | Immediately revokes that member's access. |

`GET /api/projects/:projectId` now includes `accessRole` (`OWNER`, `EDITOR`, or `VIEWER`). The existing project message endpoints are the first collaboration comment surface: only owner/editor sessions can mutate them. They are deliberately in-app only and have no outbound notification/email behaviour.

There are no bearer share tokens in this slice. If link sharing is added later, the secret must be cryptographically random, stored only as a hash, redacted from logs, and revocable independently of member grants.
