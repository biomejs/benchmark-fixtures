import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const GENERATOR_VERSION = 2;
export const DEFAULT_SEED = 0x5c55c0de;
export const CORE_SYNTAX_IDS = Object.freeze([
  "decl.variable.local",
  "decl.variable.namespaced",
  "decl.variable.modifiers",
  "decl.property.interpolated",
  "decl.property.interpolated-dashed",
  "decl.nested.empty-value",
  "decl.nested.with-value",
  "value.variable",
  "value.module.member",
  "value.module.function",
  "value.parent-selector",
  "value.string.interpolated",
  "value.identifier.interpolated",
  "value.value.interpolated",
  "value.function.interpolated",
  "value.url.interpolated",
  "value.bracketed-list",
  "value.bracketed-nested",
  "expr.binary.arithmetic",
  "expr.binary.comparison",
  "expr.binary.equality-logic",
  "expr.unary",
  "expr.parenthesized",
  "expr.comma-list",
  "expr.space-list",
  "expr.map",
  "expr.empty-map",
  "expr.keyword-argument",
  "expr.rest-argument",
]);
export const STRUCTURAL_SYNTAX_IDS = Object.freeze([
  "selector.placeholder",
  "selector.parent-suffix.identifier",
  "selector.parent-suffix.number",
  "selector.parent-suffix.hyphen",
  "selector.parent-suffix.interpolation",
  "selector.identifier.interpolated",
  "selector.attribute.interpolated-name",
  "selector.attribute.interpolated-value",
  "selector.attribute.interpolated-modifier",
  "selector.nth.interpolation",
  "selector.pseudo-class.interpolated.relative",
  "selector.pseudo-class.interpolated.selector",
  "selector.pseudo-class.interpolated.nth",
  "selector.pseudo-class.interpolated.value",
  "selector.pseudo-element.interpolated.selector",
  "selector.pseudo-element.interpolated.value",
  "at.each.single-binding",
  "at.each.multi-binding",
  "at.each.trailing-comma",
  "at.for.to",
  "at.for.through",
  "at.mixin.parameters",
  "at.function.parameters",
  "at.include.local",
  "at.include.module",
  "at.include.using",
  "at.include.content-block",
  "at.content.arguments",
  "at.if.else-if.else",
  "at.while",
  "at.return",
  "at.debug",
  "at.warn",
  "at.error",
  "at.extend",
  "at.at-root.block",
  "at.at-root.selector",
  "at.at-root.query",
  "at.import.scss-items",
  "at.import.css-plain",
  "at.use.namespace",
  "at.use.all-namespace",
  "at.use.with",
  "at.forward.prefix",
  "at.forward.show",
  "at.forward.hide",
  "at.forward.with",
  "host.keyframes.dynamic-name",
  "host.keyframes.interpolated-selector",
  "host.keyframes.variable",
  "host.media.interpolated-query",
  "host.media.expression-feature",
  "host.supports.interpolation",
  "host.supports.expression-declaration",
  "lex.line-comment",
  "lex.block-comment",
  "boundary.semicolonless-final-statement",
]);
export const FILE_CONFIGS = Object.freeze([
  {
    id: "full-spectrum",
    path: "generated/full-spectrum.scss",
    targetBytes: 512 * 1024,
  },
  {
    id: "hot-ambiguous-nested-rules",
    path: "generated/hot-ambiguous-nested-rules.scss",
    targetBytes: 192 * 1024,
  },
  {
    id: "hot-url-interpolation",
    path: "generated/hot-url-interpolation.scss",
    targetBytes: 128 * 1024,
  },
  {
    id: "hot-interpolated-strings",
    path: "generated/hot-interpolated-strings.scss",
    targetBytes: 128 * 1024,
  },
  {
    id: "hot-tight-binary-expressions",
    path: "generated/hot-tight-binary-expressions.scss",
    targetBytes: 192 * 1024,
  },
  {
    id: "hot-lists-maps-arguments",
    path: "generated/hot-lists-maps-arguments.scss",
    targetBytes: 192 * 1024,
  },
]);
const HOTPATH_ALLOWED_IDS = Object.freeze({
  "hot-ambiguous-nested-rules": ["hot.ambiguous-nested-rules"],
  "hot-url-interpolation": ["hot.url-interpolation"],
  "hot-interpolated-strings": ["hot.interpolated-strings"],
  "hot-tight-binary-expressions": ["hot.tight-binary", "hot.precedence"],
  "hot-lists-maps-arguments": ["hot.list", "hot.map", "hot.arguments"],
});

export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function sha256(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function utf8Bytes(source) {
  return Buffer.byteLength(source, "utf8");
}

function syntaxEntry(id, phase, render) {
  return Object.freeze({ id, phase, render });
}

function marker(fileId, syntaxId, ordinal) {
  return `/* corpus:${fileId}:${syntaxId}:${String(ordinal).padStart(4, "0")} */\n`;
}

function rule(name, body) {
  return `.${name} {\n${body}\n}\n`;
}

function renderWithMarker(syntaxId, renderSource) {
  return (context) =>
    marker(context.fileId, syntaxId, context.ordinal) +
    renderSource(context.ordinal, context.name);
}

export const SYNTAX_CATALOG = Object.freeze([
  syntaxEntry(
    "decl.variable.local",
    "body",
    renderWithMarker("decl.variable.local", (ordinal) => `$local-${ordinal}: ${ordinal}px;\n`),
  ),
  syntaxEntry(
    "decl.variable.namespaced",
    "body",
    renderWithMarker(
      "decl.variable.namespaced",
      (ordinal) => `theme.$value-${ordinal}: ${ordinal}px;\n`,
    ),
  ),
  syntaxEntry(
    "decl.variable.modifiers",
    "body",
    renderWithMarker(
      "decl.variable.modifiers",
      (ordinal) =>
        `$default-${ordinal}: ${ordinal}px !default;\n$global-${ordinal}: ${ordinal}px !global;\n`,
    ),
  ),
  syntaxEntry(
    "decl.property.interpolated",
    "body",
    renderWithMarker(
      "decl.property.interpolated",
      (ordinal) => rule(`decl-${ordinal}`, `#{$property-${ordinal}}: ${ordinal}px;`),
    ),
  ),
  syntaxEntry(
    "decl.property.interpolated-dashed",
    "body",
    renderWithMarker(
      "decl.property.interpolated-dashed",
      (ordinal) =>
        rule(`decl-dashed-${ordinal}`, `--theme-#{$slot-${ordinal}}: ${ordinal}px;`),
    ),
  ),
  syntaxEntry(
    "decl.nested.empty-value",
    "body",
    renderWithMarker(
      "decl.nested.empty-value",
      (ordinal) => rule(`nested-empty-${ordinal}`, `font: { size: ${ordinal}px; }`),
    ),
  ),
  syntaxEntry(
    "decl.nested.with-value",
    "body",
    renderWithMarker(
      "decl.nested.with-value",
      (ordinal) =>
        rule(`nested-value-${ordinal}`, "font: 12px/1.2 { family: sans-serif; }"),
    ),
  ),
  syntaxEntry(
    "value.variable",
    "body",
    renderWithMarker(
      "value.variable",
      (ordinal) => rule(`value-variable-${ordinal}`, `width: $local-${ordinal};`),
    ),
  ),
  syntaxEntry(
    "value.module.member",
    "body",
    renderWithMarker(
      "value.module.member",
      (ordinal) => rule(`value-member-${ordinal}`, "width: math.$pi;"),
    ),
  ),
  syntaxEntry(
    "value.module.function",
    "body",
    renderWithMarker(
      "value.module.function",
      (ordinal) => rule(`value-function-${ordinal}`, `width: math.div(${ordinal}px, 2);`),
    ),
  ),
  syntaxEntry(
    "value.parent-selector",
    "body",
    renderWithMarker(
      "value.parent-selector",
      (ordinal) => rule(`value-parent-${ordinal}`, `$selector-${ordinal}: &;`),
    ),
  ),
  syntaxEntry(
    "value.string.interpolated",
    "body",
    renderWithMarker(
      "value.string.interpolated",
      (ordinal) => `$string-${ordinal}: "prefix-#{$local-${ordinal}}-suffix";\n`,
    ),
  ),
  syntaxEntry(
    "value.identifier.interpolated",
    "body",
    renderWithMarker(
      "value.identifier.interpolated",
      (ordinal) => `$identifier-${ordinal}: prefix-#{$local-${ordinal}}-suffix;\n`,
    ),
  ),
  syntaxEntry(
    "value.value.interpolated",
    "body",
    renderWithMarker(
      "value.value.interpolated",
      (ordinal) => `$interpolated-${ordinal}: #{$local-${ordinal}}px;\n`,
    ),
  ),
  syntaxEntry(
    "value.function.interpolated",
    "body",
    renderWithMarker(
      "value.function.interpolated",
      (ordinal) => rule(`fn-${ordinal}`, `value: fn-#{$local-${ordinal}}(${ordinal}px);`),
    ),
  ),
  syntaxEntry(
    "value.url.interpolated",
    "body",
    renderWithMarker(
      "value.url.interpolated",
      (ordinal) =>
        rule(`url-${ordinal}`, `background: url(asset-#{$local-${ordinal}}-${ordinal}.png);`),
    ),
  ),
  syntaxEntry(
    "value.bracketed-list",
    "body",
    renderWithMarker(
      "value.bracketed-list",
      (ordinal) => `$bracketed-${ordinal}: [${ordinal}px, $local-${ordinal}, []];\n`,
    ),
  ),
  syntaxEntry(
    "value.bracketed-nested",
    "body",
    renderWithMarker(
      "value.bracketed-nested",
      (ordinal) => `$bracketed-nested-${ordinal}: [[a-${ordinal}] [b-${ordinal}, c-${ordinal}]];\n`,
    ),
  ),
  syntaxEntry(
    "expr.binary.arithmetic",
    "body",
    renderWithMarker(
      "expr.binary.arithmetic",
      (ordinal) => `$arithmetic-${ordinal}: 1 + 2 * 3 / 4 % 2 - 1;\n`,
    ),
  ),
  syntaxEntry(
    "expr.binary.comparison",
    "body",
    renderWithMarker(
      "expr.binary.comparison",
      (ordinal) =>
        `$comparison-${ordinal}: 1 < 2 and 2 <= 2 and 3 > 2 and 3 >= 3;\n`,
    ),
  ),
  syntaxEntry(
    "expr.binary.equality-logic",
    "body",
    renderWithMarker(
      "expr.binary.equality-logic",
      (ordinal) => `$logic-${ordinal}: 1 == 1 and 1 != 2 or false;\n`,
    ),
  ),
  syntaxEntry(
    "expr.unary",
    "body",
    renderWithMarker(
      "expr.unary",
      (ordinal) => `$unary-${ordinal}: -1 + +2;\n$not-${ordinal}: not false;\n`,
    ),
  ),
  syntaxEntry(
    "expr.parenthesized",
    "body",
    renderWithMarker(
      "expr.parenthesized",
      (ordinal) => `$parenthesized-${ordinal}: (1 + 2) * 3;\n`,
    ),
  ),
  syntaxEntry(
    "expr.comma-list",
    "body",
    renderWithMarker(
      "expr.comma-list",
      (ordinal) => `$comma-list-${ordinal}: a-${ordinal}, b-${ordinal}, c-${ordinal};\n`,
    ),
  ),
  syntaxEntry(
    "expr.space-list",
    "body",
    renderWithMarker(
      "expr.space-list",
      (ordinal) => `$space-list-${ordinal}: a-${ordinal} b-${ordinal} c-${ordinal};\n`,
    ),
  ),
  syntaxEntry(
    "expr.map",
    "body",
    renderWithMarker(
      "expr.map",
      (ordinal) =>
        `$map-${ordinal}: (primary: red, nested: (value: ${ordinal}px, enabled: true));\n`,
    ),
  ),
  syntaxEntry(
    "expr.empty-map",
    "body",
    renderWithMarker("expr.empty-map", (ordinal) => `$empty-map-${ordinal}: ();\n`),
  ),
  syntaxEntry(
    "expr.keyword-argument",
    "body",
    renderWithMarker(
      "expr.keyword-argument",
      (ordinal) =>
        `$keyword-${ordinal}: fn(${ordinal}px, $width: ${ordinal}px, $height: 2px);\n`,
    ),
  ),
  syntaxEntry(
    "expr.rest-argument",
    "body",
    renderWithMarker(
      "expr.rest-argument",
      (ordinal) =>
        `$rest-${ordinal}: (${ordinal}px, 2px, 3px);\n$rest-call-${ordinal}: fn($rest-${ordinal}...);\n`,
    ),
  ),
  syntaxEntry(
    "selector.placeholder",
    "body",
    renderWithMarker(
      "selector.placeholder",
      (ordinal) => `%placeholder-${ordinal} { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.parent-suffix.identifier",
    "body",
    renderWithMarker(
      "selector.parent-suffix.identifier",
      (ordinal) => `.parent-${ordinal} { &--active-${ordinal} {} }\n`,
    ),
  ),
  syntaxEntry(
    "selector.parent-suffix.number",
    "body",
    renderWithMarker(
      "selector.parent-suffix.number",
      (ordinal) => `.parent-number-${ordinal} { &-100\\.${ordinal} {} }\n`,
    ),
  ),
  syntaxEntry(
    "selector.parent-suffix.hyphen",
    "body",
    renderWithMarker(
      "selector.parent-suffix.hyphen",
      (ordinal) => `.parent-hyphen-${ordinal} { &-child-${ordinal} {} }\n`,
    ),
  ),
  syntaxEntry(
    "selector.parent-suffix.interpolation",
    "body",
    renderWithMarker(
      "selector.parent-suffix.interpolation",
      (ordinal) => `.parent-interpolation-${ordinal} { &#{$state-${ordinal}} {} }\n`,
    ),
  ),
  syntaxEntry(
    "selector.identifier.interpolated",
    "body",
    renderWithMarker(
      "selector.identifier.interpolated",
      (ordinal) => `.item-#{$name-${ordinal}} { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.attribute.interpolated-name",
    "body",
    renderWithMarker(
      "selector.attribute.interpolated-name",
      (ordinal) => `[data-#{$name-${ordinal}}=x] { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.attribute.interpolated-value",
    "body",
    renderWithMarker(
      "selector.attribute.interpolated-value",
      (ordinal) => `[lang=prefix-#{$locale-${ordinal}}] { color: blue; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.attribute.interpolated-modifier",
    "body",
    renderWithMarker(
      "selector.attribute.interpolated-modifier",
      (ordinal) => `[title="x" #{$modifier-${ordinal}}] { color: green; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.nth.interpolation",
    "body",
    renderWithMarker(
      "selector.nth.interpolation",
      (ordinal) => `.nth-${ordinal}:nth-child(2n + #{$offset-${ordinal}}) { width: ${ordinal}px; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.pseudo-class.interpolated.relative",
    "body",
    renderWithMarker(
      "selector.pseudo-class.interpolated.relative",
      (ordinal) => `.relative-${ordinal}:has(> .item-#{$name-${ordinal}}) { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.pseudo-class.interpolated.selector",
    "body",
    renderWithMarker(
      "selector.pseudo-class.interpolated.selector",
      (ordinal) => `.selector-${ordinal}:is(.item-#{$name-${ordinal}}) { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.pseudo-class.interpolated.nth",
    "body",
    renderWithMarker(
      "selector.pseudo-class.interpolated.nth",
      (ordinal) => `.nth-pseudo-${ordinal}:nth-of-type(#{$offset-${ordinal}}) { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.pseudo-class.interpolated.value",
    "body",
    renderWithMarker(
      "selector.pseudo-class.interpolated.value",
      (ordinal) => `.value-pseudo-${ordinal}:lang(prefix-#{$locale-${ordinal}}) { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.pseudo-element.interpolated.selector",
    "body",
    renderWithMarker(
      "selector.pseudo-element.interpolated.selector",
      (ordinal) => `.element-selector-${ordinal}::slotted(.item-#{$name-${ordinal}}) { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "selector.pseudo-element.interpolated.value",
    "body",
    renderWithMarker(
      "selector.pseudo-element.interpolated.value",
      (ordinal, name) =>
        `.element-value-${ordinal}::#{$pseudo-${name}}(#{$part-${name}}) { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "at.each.single-binding",
    "body",
    renderWithMarker(
      "at.each.single-binding",
      (ordinal) =>
        `@each $item-${ordinal} in a, b, c { .each-${ordinal}-#{$item-${ordinal}} { value: $item-${ordinal}; } }\n`,
    ),
  ),
  syntaxEntry(
    "at.each.multi-binding",
    "body",
    renderWithMarker(
      "at.each.multi-binding",
      (ordinal) =>
        `@each $key-${ordinal}, $value-${ordinal} in (a: 1, b: 2) { .pair-${ordinal}-#{$key-${ordinal}} { value: $value-${ordinal}; } }\n`,
    ),
  ),
  syntaxEntry(
    "at.each.trailing-comma",
    "body",
    renderWithMarker(
      "at.each.trailing-comma",
      (ordinal) =>
        `@each $tuple-${ordinal} in (a, b), (c, d), { .trailing-${ordinal} { value: $tuple-${ordinal}; } }\n`,
    ),
  ),
  syntaxEntry(
    "at.for.to",
    "body",
    renderWithMarker(
      "at.for.to",
      (ordinal) =>
        `@for $i-${ordinal} from 1 to 3 { .to-${ordinal}-#{$i-${ordinal}} { order: $i-${ordinal}; } }\n`,
    ),
  ),
  syntaxEntry(
    "at.for.through",
    "body",
    renderWithMarker(
      "at.for.through",
      (ordinal) =>
        `@for $i-${ordinal} from 1 through 3 { .through-${ordinal}-#{$i-${ordinal}} { order: $i-${ordinal}; } }\n`,
    ),
  ),
  syntaxEntry(
    "at.mixin.parameters",
    "body",
    renderWithMarker(
      "at.mixin.parameters",
      (ordinal) =>
        `@mixin mixin-${ordinal}($width, $height: $width, $args...) { width: $width; height: $height; }\n`,
    ),
  ),
  syntaxEntry(
    "at.function.parameters",
    "body",
    renderWithMarker(
      "at.function.parameters",
      (ordinal) =>
        `@function function-${ordinal}($value, $fallback: ${ordinal}px, $args...) { @return $value + $fallback; }\n`,
    ),
  ),
  syntaxEntry(
    "at.include.local",
    "body",
    renderWithMarker(
      "at.include.local",
      (ordinal) => `@include mixin-${ordinal}(${ordinal}px, $height: 2px);\n`,
    ),
  ),
  syntaxEntry(
    "at.include.module",
    "body",
    renderWithMarker(
      "at.include.module",
      (ordinal) => `@include library-${ordinal}.mixin-${ordinal}($radius: ${ordinal}px);\n`,
    ),
  ),
  syntaxEntry(
    "at.include.using",
    "body",
    renderWithMarker(
      "at.include.using",
      (ordinal) =>
        `@include mixin-${ordinal}(${ordinal}px) using ($value) { width: $value; }\n`,
    ),
  ),
  syntaxEntry(
    "at.include.content-block",
    "body",
    renderWithMarker(
      "at.include.content-block",
      (ordinal) => `@include mixin-${ordinal}(${ordinal}px) { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "at.content.arguments",
    "body",
    renderWithMarker(
      "at.content.arguments",
      (ordinal) =>
        `@mixin content-${ordinal} { @content($value-${ordinal}, $fallback: ${ordinal}px); }\n`,
    ),
  ),
  syntaxEntry(
    "at.if.else-if.else",
    "body",
    renderWithMarker(
      "at.if.else-if.else",
      (ordinal) =>
        `@if $condition-${ordinal} { .if-${ordinal} {} } @else if $fallback-${ordinal} { .else-if-${ordinal} {} } @else { .else-${ordinal} {} }\n`,
    ),
  ),
  syntaxEntry(
    "at.while",
    "body",
    renderWithMarker(
      "at.while",
      (ordinal) =>
        `$while-${ordinal}: 0;\n@while $while-${ordinal} < 1 { $while-${ordinal}: $while-${ordinal} + 1; }\n`,
    ),
  ),
  syntaxEntry(
    "at.return",
    "body",
    renderWithMarker(
      "at.return",
      (ordinal) => `@function return-${ordinal}() { @return ${ordinal}px; }\n`,
    ),
  ),
  syntaxEntry(
    "at.debug",
    "body",
    renderWithMarker("at.debug", (ordinal) => `@debug "debug-${ordinal}";\n`),
  ),
  syntaxEntry(
    "at.warn",
    "body",
    renderWithMarker("at.warn", (ordinal) => `@warn "warn-${ordinal}";\n`),
  ),
  syntaxEntry(
    "at.error",
    "body",
    renderWithMarker(
      "at.error",
      (ordinal) => `@if false { @error "error-${ordinal}"; }\n`,
    ),
  ),
  syntaxEntry(
    "at.extend",
    "body",
    renderWithMarker(
      "at.extend",
      (ordinal) =>
        `%extendable-${ordinal} { color: red; }\n.extend-${ordinal} { @extend %extendable-${ordinal} !optional; }\n`,
    ),
  ),
  syntaxEntry(
    "at.at-root.block",
    "body",
    renderWithMarker(
      "at.at-root.block",
      (ordinal) => `@at-root { .root-${ordinal} { color: red; } }\n`,
    ),
  ),
  syntaxEntry(
    "at.at-root.selector",
    "body",
    renderWithMarker(
      "at.at-root.selector",
      (ordinal) => `@at-root .root-selector-${ordinal} { color: red; }\n`,
    ),
  ),
  syntaxEntry(
    "at.at-root.query",
    "body",
    renderWithMarker(
      "at.at-root.query",
      (ordinal) =>
        `@at-root (without: media) { .root-query-${ordinal} { color: red; } }\n`,
    ),
  ),
  syntaxEntry(
    "at.import.scss-items",
    "body",
    renderWithMarker(
      "at.import.scss-items",
      (ordinal) => `@import "theme-${ordinal}", url("theme-${ordinal}.css") screen;\n`,
    ),
  ),
  syntaxEntry(
    "at.import.css-plain",
    "body",
    renderWithMarker(
      "at.import.css-plain",
      (ordinal) => `@import url("https://example.invalid/theme-${ordinal}.css") screen;\n`,
    ),
  ),
  syntaxEntry(
    "at.use.namespace",
    "preamble",
    renderWithMarker(
      "at.use.namespace",
      (ordinal) => `@use "sass:math" as math-${ordinal};\n`,
    ),
  ),
  syntaxEntry(
    "at.use.all-namespace",
    "preamble",
    renderWithMarker(
      "at.use.all-namespace",
      (ordinal) => `@use "theme-${ordinal}" as *;\n`,
    ),
  ),
  syntaxEntry(
    "at.use.with",
    "preamble",
    renderWithMarker(
      "at.use.with",
      (ordinal) =>
        `@use "theme-${ordinal}" with ($primary: blue, $spacing: ${ordinal}px);\n`,
    ),
  ),
  syntaxEntry(
    "at.forward.prefix",
    "preamble",
    renderWithMarker(
      "at.forward.prefix",
      (ordinal) => `@forward "theme-${ordinal}" as prefix-${ordinal}-*;\n`,
    ),
  ),
  syntaxEntry(
    "at.forward.show",
    "preamble",
    renderWithMarker(
      "at.forward.show",
      (ordinal) => `@forward "theme-${ordinal}" show $color-${ordinal}, mixin-${ordinal};\n`,
    ),
  ),
  syntaxEntry(
    "at.forward.hide",
    "preamble",
    renderWithMarker(
      "at.forward.hide",
      (ordinal) =>
        `@forward "theme-${ordinal}" hide $private-${ordinal}, internal-${ordinal};\n`,
    ),
  ),
  syntaxEntry(
    "at.forward.with",
    "preamble",
    renderWithMarker(
      "at.forward.with",
      (ordinal) =>
        `@forward "theme-${ordinal}" with ($spacing: ${ordinal}px !default);\n`,
    ),
  ),
  syntaxEntry(
    "host.keyframes.dynamic-name",
    "body",
    renderWithMarker(
      "host.keyframes.dynamic-name",
      (ordinal) =>
        `$animation-${ordinal}: animation-${ordinal};\n@keyframes #{$animation-${ordinal}} { from { opacity: 0; } to { opacity: 1; } }\n`,
    ),
  ),
  syntaxEntry(
    "host.keyframes.interpolated-selector",
    "body",
    renderWithMarker(
      "host.keyframes.interpolated-selector",
      (ordinal) =>
        `@keyframes animation-${ordinal} { #{$step-${ordinal}}% { opacity: 0.5; } }\n`,
    ),
  ),
  syntaxEntry(
    "host.keyframes.variable",
    "body",
    renderWithMarker(
      "host.keyframes.variable",
      (ordinal) =>
        `@keyframes $animation-${ordinal} { from { opacity: 0; } to { opacity: 1; } }\n`,
    ),
  ),
  syntaxEntry(
    "host.media.interpolated-query",
    "body",
    renderWithMarker(
      "host.media.interpolated-query",
      (ordinal) =>
        `@media (min-width: #{$width-${ordinal}}) { .media-${ordinal} { display: block; } }\n`,
    ),
  ),
  syntaxEntry(
    "host.media.expression-feature",
    "body",
    renderWithMarker(
      "host.media.expression-feature",
      (ordinal) =>
        `@media (width > $width-${ordinal}) { .media-expression-${ordinal} { display: block; } }\n`,
    ),
  ),
  syntaxEntry(
    "host.supports.interpolation",
    "body",
    renderWithMarker(
      "host.supports.interpolation",
      (ordinal) =>
        `@supports (display: #{$display-${ordinal}}) { .supports-${ordinal} { display: $display-${ordinal}; } }\n`,
    ),
  ),
  syntaxEntry(
    "host.supports.expression-declaration",
    "body",
    renderWithMarker(
      "host.supports.expression-declaration",
      (ordinal) =>
        `@supports (--feature-${ordinal}: $value-${ordinal}) { .supports-expression-${ordinal} { display: block; } }\n`,
    ),
  ),
  syntaxEntry(
    "lex.line-comment",
    "body",
    renderWithMarker(
      "lex.line-comment",
      (ordinal) => `// generated SCSS line comment ${ordinal}\n`,
    ),
  ),
  syntaxEntry(
    "lex.block-comment",
    "body",
    renderWithMarker(
      "lex.block-comment",
      (ordinal) => `/* generated SCSS block comment ${ordinal} */\n`,
    ),
  ),
  syntaxEntry(
    "boundary.semicolonless-final-statement",
    "tail",
    renderWithMarker(
      "boundary.semicolonless-final-statement",
      (ordinal) => `$semicolonless-tail-${ordinal}: ${ordinal}px\n`,
    ),
  ),
]);

const HOTPATH_RENDERERS = Object.freeze({
  "hot-ambiguous-nested-rules": Object.freeze([
    syntaxEntry(
      "hot.ambiguous-nested-rules",
      "body",
      renderWithMarker(
        "hot.ambiguous-nested-rules",
        (_ordinal, name) =>
          `.ambiguous-${name} {\n  label:hover { color: red; }\n  font:bold { color: blue; }\n}\n`,
      ),
    ),
  ]),
  "hot-url-interpolation": Object.freeze([
    syntaxEntry(
      "hot.url-interpolation",
      "body",
      renderWithMarker(
        "hot.url-interpolation",
        (_ordinal, name) =>
          `$asset-${name}: asset-${name};\n.url-${name} {\n  background: url(prefix-${name}-#{$asset-${name}}-#{fn("nested-${name}")}-suffix-${name}.png);\n}\n`,
      ),
    ),
  ]),
  "hot-interpolated-strings": Object.freeze([
    syntaxEntry(
      "hot.interpolated-strings",
      "body",
      renderWithMarker(
        "hot.interpolated-strings",
        (_ordinal, name) =>
          `$segment-${name}: segment-${name};\n$string-${name}: "prefix-${name}-#{$segment-${name}}-#{$segment-${name}}-#{$segment-${name}}-#{$segment-${name}}-suffix-${name}";\n`,
      ),
    ),
  ]),
  "hot-tight-binary-expressions": Object.freeze([
    syntaxEntry(
      "hot.tight-binary",
      "body",
      renderWithMarker(
        "hot.tight-binary",
        (_ordinal, name) =>
          `$binary-${name}: 1px+2px+3px+4px+5px+6px+7px+8px+9px+10px;\n`,
      ),
    ),
    syntaxEntry(
      "hot.precedence",
      "body",
      renderWithMarker(
        "hot.precedence",
        (_ordinal, name) => `$precedence-${name}: -1px+2px*3-4px/2;\n`,
      ),
    ),
  ]),
  "hot-lists-maps-arguments": Object.freeze([
    syntaxEntry(
      "hot.list",
      "body",
      renderWithMarker(
        "hot.list",
        (_ordinal, name) =>
          `$list-${name}: item-${name}-1 item-${name}-2 item-${name}-3 item-${name}-4, alternate-${name};\n`,
      ),
    ),
    syntaxEntry(
      "hot.map",
      "body",
      renderWithMarker(
        "hot.map",
        (ordinal, name) =>
          `$map-${name}: (primary: ${ordinal}px, nested: (value: ${ordinal}, enabled: true));\n`,
      ),
    ),
    syntaxEntry(
      "hot.arguments",
      "body",
      renderWithMarker(
        "hot.arguments",
        (ordinal, name) =>
          `$args-${name}: (${ordinal}px, 2px, 3px);\n$call-${name}: fn($args-${name}..., $width: ${ordinal}px, $height: 2px);\n`,
      ),
    ),
  ]),
});

function renderMarked(entry, fileId, context) {
  const nameOrdinal = (context.nameOffset + context.ordinal) % 1_000_000;
  const name = `${fileId.replaceAll("-", "_")}_${String(nameOrdinal).padStart(6, "0")}`;
  context.counts.set(entry.id, (context.counts.get(entry.id) ?? 0) + 1);
  return entry.render({ ...context, fileId, name });
}

function buildFullSpectrum(config, seed) {
  const counts = new Map();
  const rng = createRng(seed);
  const nameOffset = Math.floor(rng() * 1_000_000);
  const preambleEntries = SYNTAX_CATALOG.filter((entry) => entry.phase === "preamble");
  const bodyEntries = SYNTAX_CATALOG.filter((entry) => entry.phase === "body");
  const tailEntries = SYNTAX_CATALOG.filter((entry) => entry.phase === "tail");
  const blocks = [];
  let byteLength = 0;
  let ordinal = 1;

  const append = (entry) => {
    const block = renderMarked(entry, config.id, {
      counts,
      nameOffset,
      ordinal,
      rng,
    });
    blocks.push(block);
    byteLength += utf8Bytes(block);
    ordinal += 1;
  };

  for (const entry of preambleEntries) {
    append(entry);
  }
  for (const entry of bodyEntries) {
    append(entry);
  }
  let bodyIndex = 0;
  while (byteLength < config.targetBytes) {
    append(bodyEntries[bodyIndex % bodyEntries.length]);
    bodyIndex += 1;
  }
  for (const entry of tailEntries) {
    append(entry);
  }

  const source = blocks.join("");
  assert.ok(utf8Bytes(source) >= config.targetBytes, config.id);
  for (const entry of SYNTAX_CATALOG) {
    assert.ok((counts.get(entry.id) ?? 0) >= 1, entry.id);
    if (entry.phase !== "body") {
      assert.equal(counts.get(entry.id), 1, entry.id);
    }
  }

  return {
    id: config.id,
    path: config.path,
    seed,
    source,
    counts,
  };
}

function buildFocusedCorpus(config, seed) {
  const counts = new Map();
  const rng = createRng(seed);
  const nameOffset = Math.floor(rng() * 1_000_000);
  const renderers = HOTPATH_RENDERERS[config.id];
  const allowedIds = HOTPATH_ALLOWED_IDS[config.id];
  const blocks = [];
  let byteLength = 0;
  let ordinal = 1;
  let rendererIndex = 0;

  assert.ok(renderers !== undefined, config.id);
  assert.deepEqual(
    renderers.map((entry) => entry.id),
    allowedIds,
    config.id,
  );
  while (byteLength < config.targetBytes) {
    const entry = renderers[rendererIndex % renderers.length];
    const block = renderMarked(entry, config.id, {
      counts,
      nameOffset,
      ordinal,
      rng,
    });
    blocks.push(block);
    byteLength += utf8Bytes(block);
    ordinal += 1;
    rendererIndex += 1;
  }

  const source = blocks.join("");
  assert.ok(utf8Bytes(source) >= config.targetBytes, config.id);
  for (const id of counts.keys()) {
    assert.ok(allowedIds.includes(id), `${config.id}: ${id}`);
  }
  for (const id of allowedIds) {
    assert.ok((counts.get(id) ?? 0) > 0, `${config.id}: ${id}`);
  }

  return {
    id: config.id,
    path: config.path,
    seed,
    source,
    counts,
  };
}

export function buildCorpus(seed = DEFAULT_SEED) {
  const normalizedSeed = seed >>> 0;
  const files = new Map();
  for (const config of FILE_CONFIGS) {
    const file =
      config.id === "full-spectrum"
        ? buildFullSpectrum(config, normalizedSeed)
        : buildFocusedCorpus(config, normalizedSeed);
    files.set(config.id, file);
  }
  return { files, generatorVersion: GENERATOR_VERSION, seed: normalizedSeed };
}

function countLines(source) {
  return source.length === 0 ? 0 : source.split("\n").length - 1;
}

function sortedCounts(counts) {
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildManifest(corpus) {
  return {
    schemaVersion: 1,
    generatorVersion: corpus.generatorVersion,
    seed: corpus.seed,
    files: FILE_CONFIGS.map((config) => {
      const file = corpus.files.get(config.id);
      assert.ok(file !== undefined, config.id);
      return {
        id: file.id,
        path: file.path,
        targetBytes: config.targetBytes,
        bytes: utf8Bytes(file.source),
        lines: countLines(file.source),
        sha256: sha256(file.source),
        syntaxCounts: sortedCounts(file.counts),
      };
    }),
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function unexpectedScssFiles(root, expectedPaths) {
  try {
    return readdirSync(join(root, "generated"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".scss"))
      .map((entry) => `generated/${entry.name}`)
      .filter((path) => !expectedPaths.has(path))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function expectedArtifacts(corpus) {
  const artifacts = new Map();
  for (const config of FILE_CONFIGS) {
    const file = corpus.files.get(config.id);
    assert.ok(file !== undefined, config.id);
    artifacts.set(file.path, file.source);
  }
  artifacts.set("manifest.json", serializeManifest(buildManifest(corpus)));
  return artifacts;
}

export function writeCorpus(root, corpus) {
  const artifacts = expectedArtifacts(corpus);
  mkdirSync(join(root, "generated"), { recursive: true });

  const unexpected = unexpectedScssFiles(root, new Set(artifacts.keys()));
  if (unexpected.length > 0) {
    throw new Error(`unexpected SCSS artifacts:\n${unexpected.join("\n")}`);
  }

  for (const [path, source] of artifacts) {
    writeFileSync(join(root, path), source, { encoding: "utf8" });
  }
}

export function checkCorpus(root, corpus) {
  const artifacts = expectedArtifacts(corpus);
  const failures = unexpectedScssFiles(root, new Set(artifacts.keys())).map(
    (path) => `unexpected: ${path}`,
  );

  for (const [path, source] of artifacts) {
    try {
      const actual = readFileSync(join(root, path));
      const expected = Buffer.from(source, "utf8");
      if (!actual.equals(expected)) {
        failures.push(`mismatch: ${path}`);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        failures.push(`missing: ${path}`);
      } else {
        failures.push(`mismatch: ${path}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`corpus check failed:\n${failures.join("\n")}`);
  }
}

export function runSelfTests() {
  const vectorRng = createRng(DEFAULT_SEED);
  assert.deepEqual(
    Array.from({ length: 8 }, () => Math.floor(vectorRng() * 0x100000000)),
    [
      804625013, 613433415, 1848865019, 1505690751, 3847060952, 1347751920,
      623308607, 738843933,
    ],
  );
  const left = createRng(DEFAULT_SEED);
  const right = createRng(DEFAULT_SEED);
  const leftValues = Array.from({ length: 8 }, () => left());
  const rightValues = Array.from({ length: 8 }, () => right());
  assert.deepEqual(leftValues, rightValues);
  assert.ok(leftValues.every((value) => value >= 0 && value < 1));
  assert.equal(
    sha256("scss\n"),
    "da1af0fd3d92f0d499cfe912b636a70d3165765d21ca5936f561acc19cf065b3",
  );
  assert.equal(utf8Bytes("λ\n"), 3);
  assert.deepEqual(
    SYNTAX_CATALOG.filter((entry) => CORE_SYNTAX_IDS.includes(entry.id))
      .map((entry) => entry.id)
      .sort(),
    [...CORE_SYNTAX_IDS].sort(),
  );
  for (const id of STRUCTURAL_SYNTAX_IDS) {
    assert.equal(SYNTAX_CATALOG.filter((entry) => entry.id === id).length, 1, id);
  }
  const catalogIds = SYNTAX_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(catalogIds).size, catalogIds.length);
  for (const entry of SYNTAX_CATALOG) {
    const rendered = entry.render({
      fileId: "full-spectrum",
      ordinal: 1,
      name: "case-0001",
      rng: createRng(DEFAULT_SEED),
    });
    assert.ok(rendered.length > 0, entry.id);
    assert.ok(rendered.endsWith("\n"), entry.id);
  }

  const corpus = buildCorpus();
  assert.equal(corpus.generatorVersion, GENERATOR_VERSION);
  assert.deepEqual(
    [...corpus.files.keys()],
    FILE_CONFIGS.map((config) => config.id),
  );
  for (const config of FILE_CONFIGS) {
    const file = corpus.files.get(config.id);
    assert.ok(file !== undefined);
    assert.equal(file.id, config.id);
    assert.equal(file.path, config.path);
    assert.equal(file.seed, DEFAULT_SEED);
    assert.ok(utf8Bytes(file.source) >= config.targetBytes, config.id);
    assert.ok(file.source.endsWith("\n"), config.id);
  }
  for (const id of [...CORE_SYNTAX_IDS, ...STRUCTURAL_SYNTAX_IDS]) {
    assert.ok(corpus.files.get("full-spectrum").counts.get(id) >= 1, id);
  }
  for (const entry of SYNTAX_CATALOG.filter((entry) => entry.phase !== "body")) {
    assert.equal(corpus.files.get("full-spectrum").counts.get(entry.id), 1, entry.id);
  }
  for (const config of FILE_CONFIGS.slice(1)) {
    const allowedIds = HOTPATH_ALLOWED_IDS[config.id];
    const counts = corpus.files.get(config.id).counts;
    for (const id of counts.keys()) {
      assert.ok(allowedIds.includes(id), `${config.id}: ${id}`);
    }
    for (const id of allowedIds) {
      assert.ok(counts.get(id) > 0, `${config.id}: ${id}`);
    }
  }

  const manifest = buildManifest(corpus);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.generatorVersion, GENERATOR_VERSION);
  assert.equal(manifest.seed, DEFAULT_SEED);
  assert.deepEqual(
    manifest.files.map((file) => file.id),
    FILE_CONFIGS.map((config) => config.id),
  );
  for (const file of manifest.files) {
    assert.equal(typeof file.path, "string");
    assert.equal(typeof file.targetBytes, "number");
    assert.equal(typeof file.bytes, "number");
    assert.ok(file.bytes > 0);
    assert.equal(typeof file.lines, "number");
    assert.ok(file.lines > 0);
    assert.match(file.sha256, /^[0-9a-f]{64}$/u);
    assert.equal(Object.getPrototypeOf(file.syntaxCounts), Object.prototype);
    assert.deepEqual(Object.keys(file.syntaxCounts), Object.keys(file.syntaxCounts).sort());
  }
  const catalogIdSet = new Set(SYNTAX_CATALOG.map((entry) => entry.id));
  const assertOrdinalProgression = (fileId, previousOrdinal, ordinal) => {
    assert.ok(ordinal >= 1, `${fileId}: ordinal ${ordinal}`);
    assert.ok(
      ordinal === previousOrdinal || ordinal === previousOrdinal + 1,
      `${fileId}: ${previousOrdinal} -> ${ordinal}`,
    );
  };
  let focusedBlockOrdinal = 0;
  for (const ordinal of [1, 1, 2, 2, 2, 3]) {
    assertOrdinalProgression("focused multi-ID block", focusedBlockOrdinal, ordinal);
    focusedBlockOrdinal = ordinal;
  }
  for (const config of FILE_CONFIGS) {
    const generatedFile = corpus.files.get(config.id);
    const manifestFile = manifest.files.find((file) => file.id === config.id);
    assert.ok(generatedFile !== undefined, config.id);
    assert.ok(manifestFile !== undefined, config.id);
    const allowedIds =
      config.id === "full-spectrum"
        ? catalogIdSet
        : new Set(HOTPATH_ALLOWED_IDS[config.id]);
    const markerCounts = new Map();
    const markerKeys = new Set();
    const markerLines = generatedFile.source
      .split("\n")
      .filter((line) => line.startsWith("/* corpus:"));
    let previousOrdinal = 0;

    assert.equal(
      markerLines.length,
      generatedFile.source.match(/\/\* corpus:/gu)?.length ?? 0,
      config.id,
    );
    for (const line of markerLines) {
      const match = /^\/\* corpus:([^:]+):([^:]+):(\d+) \*\/$/u.exec(line);
      assert.ok(match !== null, `${config.id}: invalid marker ${line}`);
      const [, fileId, syntaxId, ordinalText] = match;
      const ordinal = Number.parseInt(ordinalText, 10);
      const markerKey = `${fileId}:${syntaxId}:${ordinalText}`;

      assert.equal(fileId, config.id, line);
      assert.ok(allowedIds.has(syntaxId), `${config.id}: ${syntaxId}`);
      assert.ok(!markerKeys.has(markerKey), `${config.id}: duplicate ${markerKey}`);
      assertOrdinalProgression(config.id, previousOrdinal, ordinal);
      assert.equal(ordinalText, String(ordinal).padStart(4, "0"), line);
      markerKeys.add(markerKey);
      markerCounts.set(syntaxId, (markerCounts.get(syntaxId) ?? 0) + 1);
      previousOrdinal = ordinal;
    }
    assert.ok(markerKeys.size > 0, config.id);
    assert.deepEqual(sortedCounts(markerCounts), sortedCounts(generatedFile.counts));
    assert.deepEqual(sortedCounts(markerCounts), manifestFile.syntaxCounts);
  }
  const fullSpectrum = corpus.files.get("full-spectrum");
  const pseudoContexts = [
    ...fullSpectrum.source.matchAll(
      /\.element-value-\d+::#\{\$pseudo-([a-z0-9_]+)\}\(#\{\$part-\1\}\)/gu,
    ),
  ].map((match) => match[1]);
  assert.equal(
    pseudoContexts.length,
    fullSpectrum.counts.get("selector.pseudo-element.interpolated.value"),
  );
  assert.equal(new Set(pseudoContexts).size, pseudoContexts.length);
  const serializedManifest = serializeManifest(manifest);
  assert.ok(serializedManifest.endsWith("\n"));
  assert.equal(/(?:timestamp|generatedAt|cwd)/u.test(serializedManifest), false);
  assert.equal(/"path": "\//u.test(serializedManifest), false);

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "scss-benchmark-"));
  try {
    assert.throws(() => checkCorpus(temporaryDirectory, corpus), /corpus check failed/u);
    writeCorpus(temporaryDirectory, corpus);
    assert.doesNotThrow(() => checkCorpus(temporaryDirectory, corpus));
    appendFileSync(
      join(temporaryDirectory, "generated", "full-spectrum.scss"),
      " ",
      "utf8",
    );
    assert.throws(
      () => checkCorpus(temporaryDirectory, corpus),
      /mismatch: generated\/full-spectrum\.scss/u,
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }

  const firstCorpus = buildCorpus(DEFAULT_SEED);
  const secondCorpus = buildCorpus(DEFAULT_SEED);
  const alternateSeed = (DEFAULT_SEED ^ 0xffffffff) >>> 0;
  const alternateCorpus = buildCorpus(alternateSeed);
  for (const config of FILE_CONFIGS) {
    const first = firstCorpus.files.get(config.id).source;
    const second = secondCorpus.files.get(config.id).source;
    const alternate = alternateCorpus.files.get(config.id);
    assert.equal(corpus.files.get(config.id).source, first, config.id);
    assert.equal(first, second, config.id);
    assert.equal(alternate.seed, alternateSeed, config.id);
    assert.notEqual(first, alternate.source, config.id);
    assert.ok(
      utf8Bytes(first) < config.targetBytes + 16 * 1024,
      `${config.id} exceeded the maximum one-block overshoot`,
    );
  }
  assert.equal(buildManifest(alternateCorpus).seed, alternateSeed);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const modes = new Set(process.argv.slice(2));
  const knownModes = new Set(["--check", "--self-test"]);
  for (const mode of modes) {
    if (!knownModes.has(mode)) {
      throw new Error(`unknown option: ${mode}`);
    }
  }
  if (modes.size > 1) {
    throw new Error("choose exactly one mode");
  }

  if (modes.has("--self-test")) {
    runSelfTests();
  } else if (modes.has("--check")) {
    checkCorpus(process.cwd(), buildCorpus());
  } else {
    writeCorpus(process.cwd(), buildCorpus());
  }
}
