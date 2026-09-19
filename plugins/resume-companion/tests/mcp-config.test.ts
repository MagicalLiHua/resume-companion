import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

type ServerConfig = {
  required?: boolean;
  default_tools_approval_mode?: string;
  disabled_tools?: string[];
  tools?: Record<string, { approval_mode?: string }>;
};

describe('Codex MCP policy', () => {
  test('keeps the profile service required and applies least-privilege browser defaults', async () => {
    const manifest = JSON.parse(await readFile(resolve(import.meta.dirname, '../.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, ServerConfig>;
    };
    const profiles = manifest.mcpServers.resume_companion;
    const browser = manifest.mcpServers.resume_browser;
    expect(profiles).toMatchObject({ required: true, default_tools_approval_mode: 'approve' });
    expect(browser).toMatchObject({ required: false, default_tools_approval_mode: 'prompt' });
    expect(browser?.disabled_tools).toEqual(expect.arrayContaining(['upload_file', 'lighthouse_audit']));

    const automatic = ['list_pages', 'select_page', 'form_observe', 'form_fill_fields', 'form_select_option', 'form_select_path', 'form_set_date', 'form_activate', 'take_snapshot', 'wait_for', 'list_network_requests', 'list_console_messages', 'get_console_message', 'take_screenshot', 'fill_form', 'fill', 'click', 'hover'];
    const prompted = ['evaluate_script', 'handle_dialog', 'get_network_request', 'navigate_page', 'new_page', 'close_page', 'press_key', 'type_text', 'drag'];
    for (const name of automatic) expect(browser?.tools?.[name]?.approval_mode, name).toBe('approve');
    for (const name of prompted) expect(browser?.tools?.[name]?.approval_mode, name).toBe('prompt');
  });
});
