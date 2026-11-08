import assert from 'node:assert/strict';
import test from 'node:test';
import { renderNshAdapterFiles } from './nsh_adapter_files.mjs';
import { renderNshSponsor } from './nsh_support_pages.mjs';

const profile = () => ({
  system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled',
  about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled',
  deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'detailed',
});
const options = selected => ({
  projectId: 'sample_tool', nameZh: '示例工具', nameEn: 'Sample Tool', owner: 'Fixture Owner',
  targetPlatforms: ['macos'], nshTargets: ['desktop'],
  profile: Object.assign(profile(), Object.fromEntries(selected.map(key => [key, 'enabled']))),
});

test('disabled support pages and autostart leave no desktop imports, assets, or template tokens', () => {
  const files = renderNshAdapterFiles(options([]));
  const member = 'sample_tool_nsh/';
  assert.equal(files.has(member + 'about.tsx'), false);
  assert.equal(files.has(member + 'sponsor.tsx'), false);
  assert.equal([...files.keys()].some(name => name.startsWith(member + 'assets/sponsor/')), false);
  assert.doesNotMatch(files.get(member + 'translations.ts'), /start_at_login|autostart_error|deep_link_received/u);
  for (const name of ['App.tsx', 'desktop.tsx']) {
    const source = files.get(member + name);
    assert.doesNotMatch(source, /__AUTOSTART_IMPORT__|__[A-Z][A-Z_]+__|BaseSwitch|autostart\.get|autostart\.set|\.\/about|\.\/sponsor/u);
  }
});

test('enabled support pages use structured copy, available content width, and host-backed switch', () => {
  const files = renderNshAdapterFiles(options(['about_page', 'sponsor_page', 'autostart']));
  const member = 'sample_tool_nsh/';
  const app = files.get(member + 'App.tsx');
  const about = files.get(member + 'about.tsx');
  const sponsor = files.get(member + 'sponsor.tsx');
  const desktop = files.get(member + 'desktop.tsx');
  const labels = files.get(member + 'translations.ts');
  assert.match(app, /SponsorPage language=\{language\(\)\} availableWidth=\{Math\.max\(0, windowSize\(\)\.width - \(narrow\(\) \? 0 : Number\(sidebarWidth\(\)\)\)/u);
  const content = JSON.parse(about.match(/const CONTENT_EN = (\{[^\n]+\});/u)?.[1] ?? 'null');
  assert.equal(content.owner, 'Fixture Owner');
  assert.equal(typeof content.contact, 'string');
  assert.equal(typeof content.contactDetail, 'string');
  assert.equal(content.disclaimerItems.length, 3);
  assert.equal(typeof content.releaseNotes, 'string');
  assert.match(about, /labels\.disclaimerItems\.map/u);
  assert.match(sponsor, /props\.availableWidth|tokens\.sponsorCardMinWidth \* 3|backgroundImage|paymentImageSize/u);
  assert.match(desktop, /import \{ Switch as BaseSwitch \} from "nsh\/base";/u);
  assert.match(desktop, /<BaseSwitch|checked=\{actual\(\) === true\}|disabled=\{actual\(\) === null \|\| busy\(\)\}/u);
  assert.match(desktop, /autostart\.get|autostart\.set|start_at_login_description|actual\(\) === null && <Action/u);
  assert.match(labels, /start_at_login_description/u);
  assert.doesNotMatch(desktop, /__AUTOSTART_IMPORT__|__[A-Z][A-Z_]+__/u);
});

test('sponsor generator uses supplied profile media, currency, and bilingual copy', () => {
  const translations = {
    'zh-CN': { sponsor: { title: '标题', subtitle_no_service: '说明', sponsor_message: '支持', payment_instructions: '付款提示', tier_name: '档位', tier_alt: '档位图', benefit: '权益', payment_alt: '付款图' } },
    'en-US': { sponsor: { title: 'Title', subtitle_no_service: 'Summary', sponsor_message: 'Support', payment_instructions: 'Payment guidance', tier_name: 'Tier', tier_alt: 'Tier image', benefit: 'Benefit', payment_alt: 'Payment image' } },
  };
  const brand = { sponsor: {
    background: 'sponsor/banner.png',
    tiers: [{ image: 'sponsor/tier.png', nameKey: 'sponsor.tier_name', imageAltKey: 'sponsor.tier_alt', currencyCode: 'USD', price: 7, benefits: [{ mainKey: 'sponsor.benefit' }] }],
    payments: [{ image: 'sponsor/payment.png', altKey: 'sponsor.payment_alt' }],
  } };
  const source = renderNshSponsor(translations, brand);
  for (const filename of ['banner.png', 'tier.png', 'payment.png']) assert.match(source, new RegExp(filename.replace('.', '\\.'), 'u'));
  assert.match(source, /USD 7|Payment guidance|付款提示|tokens\.sponsorMaxWidth/u);
  assert.match(source, /const columns = \(\) => width\(\) >= tokens\.sponsorCardMinWidth \* 3/u);
});
