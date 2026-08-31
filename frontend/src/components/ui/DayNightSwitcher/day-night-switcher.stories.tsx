import { Meta, StoryObj } from '@storybook/react';

import { DayNightSwitcher } from './index';

const meta: Meta<typeof DayNightSwitcher> = {
  component: DayNightSwitcher,
};

export default meta;
type Story = StoryObj<typeof DayNightSwitcher>;

export const Default: Story = {};
