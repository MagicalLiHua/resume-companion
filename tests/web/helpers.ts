import {expect, type APIRequestContext} from '@playwright/test';

export async function configureModel(request: APIRequestContext) {
  const me = await (await request.get('/v1/me')).json();
  const current = await (await request.get('/v1/model-settings')).json();
  const response = await request.put('/v1/model-settings', {headers: {'X-CSRF-Token': me.csrf_token}, data: {expected_revision: current.revision, protocol: 'anthropic', base_url: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash', api_key: 'synthetic-provider-test-key'}});
  expect(response.status()).toBe(200);
}
