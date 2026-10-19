import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {invoiceFinanceState,paymentAttention} from '../assets/maintenance-finance.mjs';
const migration=readFileSync('supabase/migrations/20261019_maintenance_renewal_quote_links.sql','utf8');
const client=readFileSync('assets/maintenance-finance.mjs','utf8');
const admin=readFileSync('assets/service-maintenance.js','utf8');
const check=[
 ['admin-only link RLS',/alter table public\.service_maintenance_quotation_links enable row level security/.test(migration)],
 ['public grant revoked',/revoke all on public\.service_maintenance_quotation_links from public,anon,authenticated/.test(migration)],
 ['read and link only',/grant select,insert on public\.service_maintenance_quotation_links to authenticated/.test(migration)],
 ['admin select policy',/create policy maintenance_quotation_links_admin_select[\s\S]*?private\.is_active_admin\(\)/.test(migration)],
 ['admin insert policy',/create policy maintenance_quotation_links_admin_insert[\s\S]*?private\.is_active_admin\(\)/.test(migration)],
 ['contract unique',/contract_id uuid primary key/.test(migration)],
 ['quote unique',/quotation_id uuid not null unique/.test(migration)],
 ['FK restrict deletion',/references public\.quotations\(id\) on delete restrict/.test(migration)],
 ['only renewal successors',/not found or v_predecessor is null/.test(migration)],
 ['same customer',/v_quote_customer is distinct from v_customer/.test(migration)],
 ['no rejected quote link',/v_quote_status not in \('draft','sent','accepted','converted'\)/.test(migration)],
 ['admin check inside trigger',/auth\.uid\(\) is null or not private\.is_active_admin\(\)/.test(migration)],
 ['audit link actor',/new\.linked_by:=auth\.uid\(\)/.test(migration)],
 ['link immutable through grants',!/grant\s+(?:all|update|delete)/i.test(migration)],
 ['protect customer edits',/before update of customer_id on public\.quotations/.test(migration)],
 ['no direct invoices from migration',!/insert into public\.invoices|update public\.invoices/i.test(migration)],
 ['no outbound messages',!/http_post\s*\(|net\.http|twilio|send_sms|send_email/i.test(migration)],
 ['correct quote navigation',client.includes("'/quotations?customer='")],
 ['direct invoice lookup from existing quote',client.includes("'source_quotation_id'")],
 ['backend balance used',client.includes('invoice.balance_due')],
 ['only association insert on frontend',client.includes(".insert({contract_id:contract.id,quotation_id:select.value})")],
 ['client does not create payments',!/record_invoice_payment|convert_quotation_to_invoice|\.from\('invoice_payments'\)/.test(client)],
 ['contract admin gating retained',admin.includes('requireActiveAdmin(db')],
 ['renewal card integration',admin.includes('await displayMaintenanceFinance(db,contracts,esc)')],
 ['explicit confirmation',client.includes('Permanently link this quotation')],
 ['no naive fake totals',!/Math\.random|dummy|mockInvoice|sampleInvoice/.test(client)],
 ['valid transaction boundary',/begin;[\s\S]*commit;\s*$/.test(migration)]
];
for(const [label,ok] of check)assert.ok(ok,label);
const invoice={status:'issued',payment_status:'partially_paid',balance_due:'950.00',due_date:'2026-10-17'};
assert.equal(invoiceFinanceState(invoice).code,'recorded');
assert.equal(invoiceFinanceState(null).code,'missing');
assert.equal(invoiceFinanceState({...invoice,status:'cancelled'}).code,'cancelled');
assert.equal(paymentAttention(invoice,'2026-10-19'),'Payment overdue by 2 day(s) — internal follow-up');
assert.equal(paymentAttention({...invoice,due_date:'2026-10-26'},'2026-10-19'),
  'Payment due in 7 day(s) — internal follow-up');
assert.equal(paymentAttention({...invoice,due_date:'2026-10-27'},'2026-10-19'),null);
assert.equal(paymentAttention({...invoice,balance_due:0},'2026-10-19'),null);
assert.equal(paymentAttention({...invoice,status:'cancelled'},'2026-10-19'),null);
assert.equal(paymentAttention({...invoice,due_date:null},'2026-10-19'),null);
for(const path of ['assets/maintenance-finance.mjs','assets/service-maintenance.js']){
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
}
console.log(JSON.stringify({ok:true,checks:check.length,paymentScenarios:9,noOutboundContact:true,noProductionWrites:true}));
