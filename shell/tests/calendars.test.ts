import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initDb,
  createAgent,
  createCalendarEvent,
  getCalendarEvents,
  getCalendarEventById,
  updateCalendarEvent,
  deleteCalendarEvent,
  claimDueCalendarEvents,
} from '../src/db';
import { createClient } from '@libsql/client';
import path from 'path';

const dbPath = path.join(__dirname, '../../data/db/hermitshell.db');

describe('Calendar events', () => {
  let agentId: number;

  beforeAll(async () => {
    await initDb();
    const db = createClient({ url: `file:${dbPath}` });
    await db.execute('DELETE FROM calendar_events');
    await db.execute('DELETE FROM budgets');
    await db.execute('DELETE FROM agents');

    agentId = await createAgent({
      name: 'Calendar Test Agent',
      role: 'Testing',
      telegram_token: 'token-calendar-test',
      system_prompt: 'test',
      docker_image: 'hermit/base:latest',
      is_active: 1,
      require_approval: 0,
      llm_provider: 'default',
      llm_model: 'default',
      personality: ''
    });
  });

  beforeEach(async () => {
    const db = createClient({ url: `file:${dbPath}` });
    await db.execute('DELETE FROM calendar_events');
  });

  it('creates and lists events for an agent', async () => {
    const id = await createCalendarEvent({
      agent_id: agentId,
      title: 'Daily standup',
      prompt: 'Post standup update',
      start_time: '2026-01-01T09:00:00.000Z',
      end_time: '2026-01-01T09:15:00.000Z',
      target_user_id: 12345
    });

    const events = await getCalendarEvents(agentId);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(id);
    expect(events[0].status).toBe('scheduled');
    expect(events[0].title).toBe('Daily standup');
  });

  it('updates event fields', async () => {
    const id = await createCalendarEvent({
      agent_id: agentId,
      title: 'Kickoff',
      prompt: 'Start project',
      start_time: '2026-01-01T09:00:00.000Z',
      end_time: '2026-01-01T10:00:00.000Z',
      target_user_id: 1
    });

    await updateCalendarEvent(id, { title: 'Updated kickoff', status: 'cancelled' });
    const event = await getCalendarEventById(id);

    expect(event?.title).toBe('Updated kickoff');
    expect(event?.status).toBe('cancelled');
  });

  it('claims only due events', async () => {
    const now = new Date('2026-01-01T09:30:00.000Z');

    await createCalendarEvent({
      agent_id: agentId,
      title: 'Due',
      prompt: 'run now',
      start_time: '2026-01-01T09:00:00.000Z',
      end_time: '2026-01-01T10:00:00.000Z',
      target_user_id: 10
    });

    await createCalendarEvent({
      agent_id: agentId,
      title: 'Future',
      prompt: 'run later',
      start_time: '2026-01-01T12:00:00.000Z',
      end_time: '2026-01-01T13:00:00.000Z',
      target_user_id: 11
    });

    const claimed = await claimDueCalendarEvents(now.toISOString());
    expect(claimed).toHaveLength(1);
    expect(claimed[0].title).toBe('Due');

    const events = await getCalendarEvents(agentId);
    expect(events.find(e => e.title === 'Due')?.status).toBe('running');
    expect(events.find(e => e.title === 'Future')?.status).toBe('scheduled');
  });

  it('deletes an event', async () => {
    const id = await createCalendarEvent({
      agent_id: agentId,
      title: 'Cleanup',
      prompt: 'Clean up files',
      start_time: '2026-01-01T11:00:00.000Z',
      end_time: null,
      target_user_id: 99
    });

    await deleteCalendarEvent(id);
    const events = await getCalendarEvents(agentId);
    expect(events).toHaveLength(0);
  });
});
