import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processAgentMessage } from '../src/telegram';
import * as docker from '../src/docker';
import * as db from '../src/db';
import * as history from '../src/history';
import * as workspaceDb from '../src/workspace-db';

// Mock the modules
vi.mock('../src/docker', () => ({
    spawnAgent: vi.fn(),
    docker: {},
    getCubicleStatus: vi.fn(),
    stopCubicle: vi.fn(),
    removeCubicle: vi.fn(),
    listContainers: vi.fn()
}));

vi.mock('../src/db', () => ({
    getAgentByToken: vi.fn(),
    isAllowed: vi.fn(),
    getBudget: vi.fn(),
    updateSpend: vi.fn(),
    canSpend: vi.fn(),
    updateAuditLog: vi.fn(),
    getAgentById: vi.fn(),
    getSetting: vi.fn(),
    getOperator: vi.fn(),
    getActiveMeetings: vi.fn(() => []),
    createMeeting: vi.fn(),
    updateMeetingTranscript: vi.fn(),
    closeMeeting: vi.fn(),
    getAllAgents: vi.fn(),
    createAgentRuntimeLog: vi.fn(),
    claimDueCalendarEvents: vi.fn(),
    updateCalendarEvent: vi.fn(),
    createCalendarEvent: vi.fn(() => 101),
    getCalendarEvents: vi.fn(() => []),
    deleteCalendarEvent: vi.fn(),
    getAllSettings: vi.fn(() => ({}))
}));

vi.mock('../src/history', () => ({
    loadHistory: vi.fn(() => []),
    saveHistory: vi.fn(),
    clearHistory: vi.fn()
}));

vi.mock('../src/workspace-db', () => ({
    claimDueCalendarEvents: vi.fn(),
    updateCalendarEvent: vi.fn(),
    getCalendarEvents: vi.fn(() => []),
    createCalendarEvent: vi.fn(() => 101),
    deleteCalendarEvent: vi.fn(),
    initWorkspaceDatabases: vi.fn()
}));

// Mock global fetch for Telegram API calls
global.fetch = vi.fn(() => Promise.resolve({
    json: () => Promise.resolve({ ok: true })
})) as any;

describe('Agent Panel Actions and JSON Parsing', () => {
    const mockToken = 'test-token';
    const mockChatId = 12345;
    const mockUserId = 12345;

    beforeEach(() => {
        vi.clearAllMocks();
        (db.getAgentByToken as any).mockResolvedValue({
            id: 1,
            name: 'Test Agent',
            role: 'Assistant',
            telegram_token: mockToken,
            require_approval: 0
        });
        (db.canSpend as any).mockResolvedValue(true);
        (db.isAllowed as any).mockResolvedValue(true);
    });

    it('should parse JSON output and execute CALENDAR_CREATE', async () => {
        const jsonResponse = {
            message: "Hello world",
            panelActions: ["CALENDAR_CREATE:Test Event|Test Prompt|2026-02-26T22:00:00Z"]
        };

        (docker.spawnAgent as any).mockResolvedValue({
            containerId: 'cont-123',
            output: JSON.stringify(jsonResponse)
        });

        const result = await processAgentMessage(mockToken, mockChatId, mockUserId, "Hi");

        expect(workspaceDb.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Test Event',
            prompt: 'Test Prompt',
            start_time: '2026-02-26T22:00:00Z'
        }), mockUserId);

        expect(result.output).toContain("Hello world");
        expect(result.output).toContain("✅ Created event #101");
    });

    it('should fall back to raw output if JSON is invalid', async () => {
        const rawResponse = "This is not JSON { but it has a brace";

        (docker.spawnAgent as any).mockResolvedValue({
            containerId: 'cont-123',
            output: rawResponse
        });

        const result = await processAgentMessage(mockToken, mockChatId, mockUserId, "Hi");

        expect(result.output).toBe(rawResponse);
        expect(workspaceDb.createCalendarEvent).not.toHaveBeenCalled();
    });

    it('should handle CALENDAR_LIST action', async () => {
        const jsonResponse = {
            message: "Listing your events",
            panelActions: ["CALENDAR_LIST"]
        };

        (workspaceDb.getCalendarEvents as any).mockResolvedValue([
            { id: 1, title: 'Event 1', start_time: '2026-01-01', status: 'scheduled' }
        ]);

        (docker.spawnAgent as any).mockResolvedValue({
            containerId: 'cont-123',
            output: JSON.stringify(jsonResponse)
        });

        const result = await processAgentMessage(mockToken, mockChatId, mockUserId, "List events");

        expect(workspaceDb.getCalendarEvents).toHaveBeenCalledWith(1, mockUserId);
        expect(result.output).toContain("Listing your events");
        expect(result.output).toContain("Event 1");
    });

    it('should handle CALENDAR_UPDATE action', async () => {
        const jsonResponse = {
            message: "Updating event",
            panelActions: ["CALENDAR_UPDATE:42|New Title|New Prompt|2026-03-01T10:00:00Z"]
        };

        (docker.spawnAgent as any).mockResolvedValue({
            containerId: 'cont-123',
            output: JSON.stringify(jsonResponse)
        });

        const result = await processAgentMessage(mockToken, mockChatId, mockUserId, "Update event 42");

        expect(workspaceDb.updateCalendarEvent).toHaveBeenCalledWith(42, 1, expect.objectContaining({
            title: 'New Title',
            prompt: 'New Prompt',
            start_time: '2026-03-01T10:00:00Z'
        }), mockUserId);
        expect(result.output).toContain("✅ Updated event #42");
    });

    it('should handle CALENDAR_DELETE action', async () => {
        const jsonResponse = {
            panelActions: ["CALENDAR_DELETE:99"]
        };

        (docker.spawnAgent as any).mockResolvedValue({
            containerId: 'cont-123',
            output: JSON.stringify(jsonResponse)
        });

        const result = await processAgentMessage(mockToken, mockChatId, mockUserId, "Delete event 99");

        expect(workspaceDb.deleteCalendarEvent).toHaveBeenCalledWith(99, 1, mockUserId);
        expect(result.output).toContain("✅ Deleted event #99");
    });

    it('should handle complex CALENDAR_CREATE with pipes in the prompt', async () => {
        const jsonResponse = {
            message: "Scheduling complex event",
            panelActions: ["CALENDAR_CREATE:Complex Event|This is a prompt | with pipes | in it|2026-02-27T10:00:00Z|"]
        };

        (docker.spawnAgent as any).mockResolvedValue({
            containerId: 'cont-123',
            output: JSON.stringify(jsonResponse)
        });

        const result = await processAgentMessage(mockToken, mockChatId, mockUserId, "Hi");

        expect(workspaceDb.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Complex Event',
            prompt: 'This is a prompt | with pipes | in it',
            start_time: '2026-02-27T10:00:00Z',
            end_time: null
        }), mockUserId);
    });

    it('should handle CALENDAR_CREATE with exactly 3 parts (title|prompt|start)', async () => {
        const jsonResponse = {
            panelActions: ["CALENDAR_CREATE:Simple|Do something|2026-02-27T10:00:00Z"]
        };

        (docker.spawnAgent as any).mockResolvedValue({
            containerId: 'cont-123',
            output: JSON.stringify(jsonResponse)
        });

        const result = await processAgentMessage(mockToken, mockChatId, mockUserId, "Hi");

        expect(workspaceDb.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Simple',
            prompt: 'Do something',
            start_time: '2026-02-27T10:00:00Z',
            end_time: null
        }), mockUserId);
    });
});
