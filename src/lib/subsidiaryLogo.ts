export function subsidiaryLogo(sub: { logoUrl?: string; slug: string }): string {
  return sub.logoUrl || ({ yumi: '/filiales/yumi.png', jiraya: '/filiales/jiraya.svg' }[sub.slug.toLowerCase()] ?? '')
}
