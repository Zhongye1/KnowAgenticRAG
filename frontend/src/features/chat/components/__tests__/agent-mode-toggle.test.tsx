import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AgentModeToggle } from '../agent-mode-toggle';
import { useChatSettingsStore } from '../../stores/chat-settings-store';

describe('AgentModeToggle', () => {
  it('默认关闭（chat 模式），点击后切到 agent 并持久化', async () => {
    const user = userEvent.setup();
    render(<AgentModeToggle />);

    const toggle = screen.getByRole('button', { name: 'Agent' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(useChatSettingsStore.getState().mode).toBe('chat');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(useChatSettingsStore.getState().mode).toBe('agent');
    expect(window.localStorage.getItem('ragf-chat-mode')).toBe('agent');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem('ragf-chat-mode')).toBe('chat');
  });
});
