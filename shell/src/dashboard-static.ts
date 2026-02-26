import * as path from 'path';
import * as fs from 'fs';

export function resolveDashboardStaticRoot(serverDirname: string): string {
    const candidates = [
        path.join(serverDirname, '../dashboard/dist'),
        path.join(serverDirname, '../../dashboard/src/public'),
        path.join(process.cwd(), 'dashboard/src/public')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            return candidate;
        }
    }

    return candidates[0];
}

