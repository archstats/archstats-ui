// Compiles every SFC the way Vue actually compiles it: template expressions
// parsed (not just tag-matched), TypeScript stripped, identifiers prefixed.
//
// `npm run check` verifies module resolution and the plain parse verifies
// syntax; neither reads the inside of a template expression. A `v-for`
// variable used outside its scope, or a stray non-null assertion, compiles
// clean under both and throws at runtime, which is how the dimension builder
// once shipped a crash that neither check could see.
const { parse, compileScript, compileTemplate } = require("@vue/compiler-sfc");
const { parse: parseTemplate, NodeTypes } = require("@vue/compiler-dom");
const fs = require("fs");
const path = require("path");

// Names Vue resolves at runtime rather than from the setup block.
const GLOBALS = new Set(["Math", "Number", "String", "Boolean", "Array", "Object", "Date", "JSON", "isNaN", "parseInt", "parseFloat", "undefined", "null", "true", "false", "console", "window"]);

const roots = process.argv.slice(2);
const files = [];
const walk = p => {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
  else if (p.endsWith(".vue")) files.push(p);
};
for (const r of (roots.length ? roots : ["src"])) walk(r);

// Which components render a default `<slot>`. A component that does not, but
// is given children, drops them silently: no error, no warning, nothing in
// the DOM. That is how a modal came to set its own `open` flag against an
// element Vue had never created.
const defaultSlot = new Map();
for (const file of files) {
  try {
    const { descriptor } = parse(fs.readFileSync(file, "utf8"), { filename: file });
    const name = path.basename(file, ".vue");
    // Only a PascalCase name can be mistaken for a component in a template;
    // a file called `table.vue` must not make every `<table>` a finding.
    if (!/^[A-Z]/.test(name)) continue;
    const tpl = descriptor.template ? descriptor.template.content : "";
    defaultSlot.set(name, /<slot(?![^>]*\sname=)[^>]*>/.test(tpl));
  } catch { /* the per-file pass below reports it */ }
}

function walkNodes(node, visit) {
  visit(node);
  for (const child of node.children || []) if (child && typeof child === "object") walkNodes(child, visit);
}

let bad = 0;
for (const file of files.sort()) {
  const source = fs.readFileSync(file, "utf8");
  try {
    const { descriptor, errors } = parse(source, { filename: file });
    if (errors.length) throw errors[0];
    const ts = (descriptor.scriptSetup?.lang ?? descriptor.script?.lang) === "ts";
    let bindings;
    if (descriptor.script || descriptor.scriptSetup) {
      bindings = compileScript(descriptor, { id: "x" }).bindings;
    }
    if (descriptor.template) {
      const r = compileTemplate({
        source: descriptor.template.content,
        filename: file,
        id: "x",
        compilerOptions: {
          prefixIdentifiers: true,
          expressionPlugins: ts ? ["typescript"] : [],
          bindingMetadata: bindings,
        },
      });
      if (r.errors.length) throw r.errors[0];

      // Anything the template names that the setup block does not define
      // compiles cleanly and throws at runtime. Vue marks exactly these by
      // leaving them on `_ctx`, so they are findable before a browser finds
      // them: a `v-for` variable used outside its loop, a handler that was
      // renamed, a helper deleted with the markup that used to call it.
      // Children handed to a component with no default slot. Walked on the
      // parser's own tree rather than by regex, because a `<template #slot>`
      // holding a nested `<template v-if>` defeats any non-greedy match.
      const dropped = [];
      walkNodes(parseTemplate(descriptor.template.content), node => {
        if (node.type !== NodeTypes.ELEMENT || !defaultSlot.has(node.tag) || defaultSlot.get(node.tag)) return;
        const bare = (node.children || []).some(child => {
          if (child.type === NodeTypes.COMMENT) return false;
          if (child.type === NodeTypes.TEXT) return child.content.trim().length > 0;
          if (child.type === NodeTypes.ELEMENT && child.tag === "template") {
            return !(child.props || []).some(prop => prop.type === NodeTypes.DIRECTIVE && prop.name === "slot");
          }
          return true;
        });
        if (bare) dropped.push(node.tag);
      });
      if (dropped.length) {
        const tag = dropped[0];
        throw new Error(`<${tag}> is given content, but ${tag}.vue renders no default <slot> — Vue drops it silently`);
      }

      if (bindings) {
        const unresolved = new Set();
        for (const m of r.code.matchAll(/_ctx\.([A-Za-z_$][\w$]*)/g)) {
          const name = m[1];
          if (name.startsWith("$") || bindings[name] || GLOBALS.has(name)) continue;
          unresolved.add(name);
        }
        if (unresolved.size) {
          throw new Error(`template uses ${[...unresolved].map(n => `\`${n}\``).join(", ")}, which the script does not define`);
        }
      }
    }
  } catch (e) {
    bad++;
    console.log(`FAIL ${file}\n     ${(e && e.message) || e}`);
  }
}
console.log(`${files.length - bad}/${files.length} components compile.`);
process.exit(bad ? 1 : 0);
