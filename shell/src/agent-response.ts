export type ParsedAgentResponse = {
    userId?: string;
    message: string;
    action: string;
    terminal: string;
    panelActions: string[];
};

function asString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    return String(value);
}

export function parseAgentResponse(rawOutput: string): ParsedAgentResponse {
    const fallback: ParsedAgentResponse = {
        message: asString(rawOutput).trim(),
        action: '',
        terminal: '',
        panelActions: []
    };

    const output = asString(rawOutput);
    const firstBrace = output.indexOf('{');
    const lastBrace = output.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return fallback;
    }

    try {
        const jsonStr = output.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonStr);
        const panelActions = Array.isArray(parsed.panelActions)
            ? parsed.panelActions.map((item: unknown) => asString(item)).filter(Boolean)
            : [];

        return {
            userId: parsed.userId !== undefined ? asString(parsed.userId) : undefined,
            message: asString(parsed.message).trim(),
            action: asString(parsed.action).trim(),
            terminal: asString(parsed.terminal).trim(),
            panelActions
        };
    } catch {
        return fallback;
    }
}

export function parseFileAction(action: string): string | null {
    const normalized = asString(action).trim();
    if (!normalized.toUpperCase().startsWith('FILE:')) return null;

    const candidate = normalized.slice(5).trim();
    if (!candidate) return null;

    if (candidate.includes('..') || candidate.includes('/') || candidate.includes('\\')) {
        return null;
    }

    return candidate;
}

