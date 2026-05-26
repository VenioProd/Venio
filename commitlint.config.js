// Conventional Commits — voir CONTRIBUTING.md.
// Types alignés sur l'historique : feat, fix, refactor, chore, docs, test, ci, build, perf, style, security.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'chore',
        'docs',
        'test',
        'ci',
        'build',
        'perf',
        'style',
        'security',
        'revert',
      ],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 120],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
}
