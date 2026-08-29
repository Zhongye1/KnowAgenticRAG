import { test as setup, expect } from '@playwright/test';
import { createUser } from '../../src/testing/data-generators';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const user = createUser();

  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForURL('/auth/login');

  // go to registration:
  await page.getByRole('link', { name: /注册/ }).click();

  // registration:
  await page.getByLabel('用户名').click();
  await page.getByLabel('用户名').fill(user.username);
  await page.getByLabel('昵称').click();
  await page.getByLabel('昵称').fill(user.nickname);
  await page.getByLabel('邮箱').click();
  await page.getByLabel('邮箱').fill(user.email);
  await page.getByLabel('密码').click();
  await page.getByLabel('密码').fill(user.password);
  await page.getByRole('button', { name: /^注册$/ }).click();
  await page.waitForURL('/auth/login');

  // log in:
  await page.getByLabel('用户名').click();
  await page.getByLabel('用户名').fill(user.username);
  await page.getByLabel('密码').click();
  await page.getByLabel('密码').fill(user.password);
  await page.getByRole('button', { name: /^登录$/ }).click();
  await page.waitForURL('/app');

  // log out:
  await page.getByRole('button', { name: 'Open user menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign Out' }).click();
  await page.waitForURL('/auth/login?redirectTo=%2Fapp');

  // log in again:
  await page.getByLabel('用户名').click();
  await page.getByLabel('用户名').fill(user.username);
  await page.getByLabel('密码').click();
  await page.getByLabel('密码').fill(user.password);
  await page.getByRole('button', { name: /^登录$/ }).click();
  await page.waitForURL('/app');

  await page.context().storageState({ path: authFile });
});
