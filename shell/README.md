# CrabShell

A secure shell wrapper with Telegram bot integration for managing AI agents.

## Quick Start

```bash
cd shell
npm install
npm start
```

Access the dashboard at `http://localhost:3000/dashboard/`

## First Time Setup

On first launch, you'll see the **Initialization Screen** where you can create your admin username, password, and Operator Telegram ID.

## Troubleshooting

### Locked Login Page After Reinstall

If after cleaning and reinstalling the app, the initial page shows a locked login page instead of the user credentials setup screen, the issue is that the CrabShell server detects that an entry already exists in the `admins` table. Even after a "clean reinstall," the persistent data stored in the `data/` directory often survives unless explicitly deleted.

To fix this and trigger the **Initialization Screen** (Setup), follow these steps:

#### 1. Wipe the existing database

The database file is stored in `data/db/`. You need to delete this file to force the system to return to "Setup Mode."

Run this command from the root of the `crabshell` folder:

```bash
rm -rf data/db/*.db
```

#### 2. Restart the Shell server

Once the database file is deleted, you must restart the Node.js process so it can re-initialize the schema and detect that there are zero admins.

```bash
cd shell
npm start
```

#### 3. Refresh the Dashboard

Open your browser to:

`http://localhost:3000/dashboard/`

You should now see the **"INITIALIZE SYSTEM"** screen with the **"First Time Setup"** notice, allowing you to create your admin username, password, and Operator ID.

### Why did this happen?

In your `shell/src/server.ts` file, the logic that decides which screen to show is:

```typescript
const adminCount = await getAdminCount();
if (adminCount === 0) {
    return { status: 'setup_required' }; // Shows the Registration page
}
```

If you didn't delete the `data/` folder during your "clean reinstall," the old `crabshell.db` file was still there. Since that file contained your old admin account, the system skipped setup and went straight to the login (Locked) screen.

### Troubleshooting persistence (Docker)

If you are running CrabShell via **Docker Compose**, the data is likely trapped in a Docker Volume. To truly wipe it, run:

```bash
docker-compose down -v
```

The `-v` flag deletes the volumes associated with the containers, ensuring the database is actually destroyed.
