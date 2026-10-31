#!/usr/bin/env node
/**
 * Signale les chaînes qui ressemblent à du français et qui ne passent pas par t().
 * Usage : node scripts/i18n-audit.mjs <fichier|dossier>...   (défaut : src)
 * Heuristique : lettres accentuées ou mots français courants dans un texte JSX,
 * un attribut, une chaîne ou un gabarit. Les commentaires, imports, console.* et
 * types littéraux sont ignorés. Une ligne `// i18n-ignore` (ou /* i18n-ignore *​/)
 * sur la ligne précédente exempte la chaîne (valeurs métier stockées en base, etc.).
 * Code de sortie 1 s'il reste des suspects.
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const roots = process.argv.slice(2)
if (roots.length === 0) roots.push('src')

const ACCENT = /[àâäçéèêëîïôöùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŒ]/
const WORDS =
  /\b(le|la|les|des|une|pour|avec|sans|dans|vous|votre|vos|aucun|aucune|nouveau|nouvelle|ajouter|modifier|supprimer|enregistrer|annuler|voir|retour|chargement|erreur|envoyer|fermer|créer|rechercher|sélectionner|choisir|télécharger|valider|confirmer|statut|date|montant|nom|prénom|téléphone|désormais|jamais|toujours|tous|toutes|cette|ces|est|sont|pas|plus|sur|par|ou|et)\b/gi

function listFiles(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) return [target]
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'i18n', '__tests__', 'test'].includes(entry.name)) return []
      return listFiles(full)
    }
    if (!/\.(tsx|ts)$/.test(entry.name)) return []
    if (/\.(test|spec)\.(tsx|ts)$/.test(entry.name) || entry.name.endsWith('.d.ts')) return []
    return [full]
  })
}

function looksFrench(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length < 2) return false
  if (/^[\w./:#@\-_${}[\]()=&?%+*<>|,;'"`\\ ]*$/.test(clean) && !ACCENT.test(clean)) {
    const hits = clean.match(WORDS) ?? []
    return hits.length >= 2 && clean.split(' ').length >= 3
  }
  if (ACCENT.test(clean)) return /[A-Za-zÀ-ÿ]{3,}/.test(clean)
  const hits = clean.match(WORDS) ?? []
  return hits.length >= 2
}

function ignoredContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true
    if (ts.isLiteralTypeNode(p) || ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p)) return true
    if (ts.isCallExpression(p)) {
      const callee = p.expression.getText()
      if (/^(console\.\w+|t|translate|require|describe|it|test|expect|Symbol|import)$/.test(callee)) return true
      if (/^(t|translate)$/.test(callee)) return true
    }
    if (ts.isJsxAttribute(p)) {
      const name = p.name.getText()
      if (
        [
          'className',
          'key',
          'id',
          'to',
          'href',
          'src',
          'type',
          'name',
          'htmlFor',
          'role',
          'style',
          'data-testid',
          'viewBox',
          'd',
          'fill',
          'stroke',
          'xmlns',
        ].includes(name) ||
        name.startsWith('data-')
      )
        return true
    }
    if (ts.isPropertyAssignment(p) && p.initializer === node) {
      const key = p.name.getText().replace(/['"]/g, '')
      if (
        [
          'className',
          'id',
          'key',
          'type',
          'to',
          'href',
          'path',
          'src',
          'testId',
          'icon',
          'color',
          'fontFamily',
        ].includes(key)
      )
        return true
    }
    if (
      ts.isElementAccessExpression(p) ||
      (ts.isBinaryExpression(p) && ['===', '!==', '==', '!='].includes(p.operatorToken.getText()))
    )
      return true
    if (ts.isCaseClause(p)) return true
  }
  return false
}

let total = 0
for (const root of roots) {
  for (const file of listFiles(root)) {
    const source = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const lines = source.split('\n')
    const report = (node, text) => {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      const previous = lines[line - 1] ?? ''
      if (/i18n-ignore/.test(previous) || /i18n-ignore/.test(lines[line] ?? '')) return
      total += 1
      console.log(`${file}:${line + 1}: ${text.replace(/\s+/g, ' ').trim().slice(0, 100)}`)
    }
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        if (looksFrench(node.getText(sf))) report(node, node.getText(sf))
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (!ignoredContext(node) && looksFrench(node.text)) report(node, node.text)
      } else if (ts.isTemplateExpression(node)) {
        const text = node.head.text + node.templateSpans.map((s) => s.literal.text).join(' ')
        if (!ignoredContext(node) && looksFrench(text)) report(node, text)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}
console.log(total === 0 ? 'i18n-audit : aucun suspect.' : `i18n-audit : ${total} suspect(s).`)
process.exit(total === 0 ? 0 : 1)
