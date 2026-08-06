/**
 * Wiring test for the host-side gh-CLI env-forwarding integration point.
 *
 * ghCliEnvArgs' own gating logic is behavior-tested in gh-cli-env.test.ts,
 * but that does not prove buildContainerArgs actually calls it — a direct
 * unit test stays green even if the reach-in is deleted. buildContainerArgs
 * is entangled with OneCLI and not cheaply invocable, so we assert the
 * integration structurally: inside buildContainerArgs there is an
 * `args.push(...ghCliEnvArgs(containerConfig))` call. Delete the reach-in
 * and this goes red.
 */
import fs from 'fs';
import path from 'path';

import { describe, it, expect } from 'vitest';
import ts from 'typescript';

function sourceFile(): ts.SourceFile {
  const p = path.resolve(process.cwd(), 'src/container-runner.ts');
  return ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true);
}

function findFunction(sf: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Is this node `args.push(...ghCliEnvArgs(<anything>))`? */
function isSpreadPushOfEnvArgs(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.name.text !== 'push' ||
    !ts.isIdentifier(callee.expression) ||
    callee.expression.text !== 'args'
  ) {
    return false;
  }
  return node.arguments.some(
    (arg) =>
      ts.isSpreadElement(arg) &&
      ts.isCallExpression(arg.expression) &&
      ts.isIdentifier(arg.expression.expression) &&
      arg.expression.expression.text === 'ghCliEnvArgs',
  );
}

describe('container-runner.ts wires in ghCliEnvArgs', () => {
  const sf = sourceFile();
  const fn = findFunction(sf, 'buildContainerArgs');

  it('finds buildContainerArgs', () => {
    expect(fn).toBeDefined();
  });

  it('calls args.push(...ghCliEnvArgs(containerConfig)) inside buildContainerArgs', () => {
    let wired = false;
    const visit = (node: ts.Node) => {
      if (isSpreadPushOfEnvArgs(node)) wired = true;
      if (!wired) ts.forEachChild(node, visit);
    };
    if (fn?.body) visit(fn.body);
    expect(wired).toBe(true);
  });
});
