import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../live/index.html", import.meta.url), "utf8");
test("public production store is branded and contains real contact information", () => {
  for (const v of ["Minarva CCTV Store", "916235353732", "minarvatechnologies@gmail.com","Thiruvananthapuram"]) assert.ok(source.includes(v));
});
test("launch site has usable camera catalogue, quote builder and product selection", () => {
  for (const v of ['id="cards"', 'id="quoteForm"', 'id="cartOpen"', 'id="submitCart"', "4 Camera CCTV Setup","8 Camera CCTV Setup", "Wi-Fi Camera Solutions"]) assert.ok(source.includes(v), v);
});
test("no merchant payment, unverified price, hidden messaging or paid external API", () => {
  assert.match(source, /Online payment is not enabled/);
  assert.match(source, /Verified quote on request/);
  assert.match(source, /window\.open\(wa\(/);
  assert.doesNotMatch(source, /<script[^>]*src="https:|cashfree\.checkout|\/store\/carts\/.*\/complete|stripe\.confirm|PGCreateOrder|ShiprocketCreateOrder/);
});
test("checkout remains absent while request quote is available", () => {
  assert.match(source, /This is a quotation enquiry, not a paid order/);
  assert.match(source, /https:\/\/wa\.me\/916235353732/);
  assert.doesNotMatch(source, /href="\/checkout"/);
});
test("customer data stays in browser, without network capture", () => {
  assert.doesNotMatch(source, /localStorage|navigator\.sendBeacon|fetch\(|XMLHttpRequest|<form[^>]+action=/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /utm_source/);
});