import { describe, it, expect } from 'vitest'
import {
  extractNotionId,
  notionRichTextToPlainText,
  notionPageTitle,
  notionBlockToNoteBlock,
  buildUnsupportedBlock,
  notionPageToStudentDraft,
  createNotionClient,
  NotionTokenMissingError,
  NOTION_DEFAULT_VERSION,
} from '../lib/education/notion.js'

describe('lib/education/notion — extractNotionId', () => {
  it('extracts a dashed UUID', () => {
    const id = extractNotionId('a8d8e1d2-1234-4abc-9def-0123456789ab')
    expect(id).toBe('a8d8e1d2-1234-4abc-9def-0123456789ab')
  })

  it('extracts a flat 32-hex id from a Notion URL', () => {
    const id = extractNotionId(
      'https://www.notion.so/workspace/My-Page-1234abcd5678ef901234abcd5678ef90',
    )
    expect(id).toBe('1234abcd-5678-ef90-1234-abcd5678ef90')
  })

  it('returns null for empty / non-string inputs', () => {
    expect(extractNotionId('')).toBeNull()
    expect(extractNotionId(null)).toBeNull()
    expect(extractNotionId(undefined)).toBeNull()
    expect(extractNotionId('   ')).toBeNull()
    expect(extractNotionId('https://example.com/no-id-here')).toBeNull()
  })

  it('lowercases uppercase UUIDs', () => {
    const id = extractNotionId('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')
    expect(id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })
})

describe('lib/education/notion — rich text', () => {
  it('joins plain_text across items', () => {
    expect(
      notionRichTextToPlainText([
        { plain_text: 'Hello ' },
        { plain_text: 'World' },
      ]),
    ).toBe('Hello World')
  })

  it('falls back to text.content when plain_text is missing', () => {
    expect(
      notionRichTextToPlainText([{ text: { content: 'fallback' } }]),
    ).toBe('fallback')
  })

  it('returns empty string for invalid input', () => {
    expect(notionRichTextToPlainText(null)).toBe('')
    expect(notionRichTextToPlainText(undefined)).toBe('')
  })
})

describe('lib/education/notion — page title', () => {
  it('reads the title from a property of type title', () => {
    const page = {
      properties: {
        Other: { type: 'rich_text', rich_text: [{ plain_text: 'ignored' }] },
        Name: { type: 'title', title: [{ plain_text: 'Cours 1' }] },
      },
    }
    expect(notionPageTitle(page)).toBe('Cours 1')
  })

  it('returns empty string when no title property exists', () => {
    expect(notionPageTitle({ properties: {} })).toBe('')
    expect(notionPageTitle(null)).toBe('')
  })
})

describe('lib/education/notion — block conversion', () => {
  it('maps a paragraph block', () => {
    const block = notionBlockToNoteBlock({
      id: 'b1',
      type: 'paragraph',
      paragraph: { rich_text: [{ plain_text: 'Hello' }] },
    })
    expect(block).toMatchObject({ id: 'b1', type: 'paragraph', text: 'Hello', checked: false, level: 1 })
  })

  it('maps heading_2 with level 2', () => {
    const block = notionBlockToNoteBlock({
      id: 'h2',
      type: 'heading_2',
      heading_2: { rich_text: [{ plain_text: 'Section' }] },
    })
    expect(block.type).toBe('heading')
    expect(block.level).toBe(2)
    expect(block.text).toBe('Section')
  })

  it('maps a to_do block keeping checked state', () => {
    const block = notionBlockToNoteBlock({
      id: 't1',
      type: 'to_do',
      to_do: { rich_text: [{ plain_text: 'Do me' }], checked: true },
    })
    expect(block.type).toBe('checklist')
    expect(block.checked).toBe(true)
  })

  it('maps a code block and stores its language in meta', () => {
    const block = notionBlockToNoteBlock({
      id: 'c1',
      type: 'code',
      code: { rich_text: [{ plain_text: "console.log('hi')" }], language: 'javascript' },
    })
    expect(block.type).toBe('code')
    expect(block.text).toBe("console.log('hi')")
    expect(block.meta).toMatchObject({ language: 'javascript' })
  })

  it('maps a divider block', () => {
    const block = notionBlockToNoteBlock({ id: 'd1', type: 'divider', divider: {} })
    expect(block.type).toBe('divider')
    expect(block.text).toBe('')
  })

  it('maps a bookmark block to a link with url in meta', () => {
    const block = notionBlockToNoteBlock({
      id: 'bm',
      type: 'bookmark',
      bookmark: { url: 'https://example.com' },
    })
    expect(block.type).toBe('link')
    expect(block.text).toBe('https://example.com')
    expect(block.meta).toMatchObject({ url: 'https://example.com' })
  })

  it('produces an unsupported callout for unknown block types', () => {
    const block = notionBlockToNoteBlock({ id: 'x1', type: 'embed', embed: {} })
    expect(block.type).toBe('callout')
    expect(block.text).toMatch(/non supporté/i)
    expect(block.meta).toMatchObject({ unsupported: true, notionType: 'embed' })
  })

  it('buildUnsupportedBlock surfaces the raw type', () => {
    const block = buildUnsupportedBlock('synced_block', 'sb1')
    expect(block.id).toBe('sb1')
    expect(block.type).toBe('callout')
    expect(block.text).toContain('synced_block')
  })
})

describe('lib/education/notion — student draft extraction', () => {
  it('reads first name / last name / email from explicit columns', () => {
    const draft = notionPageToStudentDraft({
      properties: {
        Prenom: { type: 'rich_text', rich_text: [{ plain_text: 'Marie' }] },
        Nom: { type: 'rich_text', rich_text: [{ plain_text: 'Dupont' }] },
        Email: { type: 'email', email: 'Marie@Ema.FR' },
      },
    })
    expect(draft).toEqual({ firstName: 'Marie', lastName: 'Dupont', email: 'marie@ema.fr', phone: '' })
  })

  it('falls back to splitting a single title column', () => {
    const draft = notionPageToStudentDraft({
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Jean Martin' }] },
      },
    })
    expect(draft.firstName).toBe('Jean')
    expect(draft.lastName).toBe('Martin')
  })

  it('uses the title as last name when only one part is present', () => {
    const draft = notionPageToStudentDraft({
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Solo' }] },
      },
    })
    expect(draft.lastName).toBe('Solo')
    expect(draft.firstName).toBe('')
  })

  it('returns empty draft when nothing matches', () => {
    const draft = notionPageToStudentDraft({ properties: {} })
    expect(draft).toEqual({ firstName: '', lastName: '', email: '', phone: '' })
  })
})

describe('lib/education/notion — client', () => {
  it('throws NotionTokenMissingError when no env token is set', () => {
    const previousToken = process.env.NOTION_API_TOKEN
    delete process.env.NOTION_API_TOKEN
    expect(() => createNotionClient()).toThrow(NotionTokenMissingError)
    if (previousToken !== undefined) process.env.NOTION_API_TOKEN = previousToken
  })

  it('uses the configured token, version, and default version constant', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const client = createNotionClient({ token: 'tok_test', fetchImpl })
    await client.getPage('abc123')
    expect(calls).toHaveLength(1)
    const headers = (calls[0].init?.headers || {}) as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok_test')
    expect(headers['Notion-Version']).toBe(NOTION_DEFAULT_VERSION)
    expect(calls[0].url).toContain('/pages/abc123')
  })

  it('paginates listBlockChildren until has_more is false', async () => {
    let page = 0
    const fetchImpl = (async () => {
      page += 1
      if (page === 1) {
        return new Response(JSON.stringify({
          results: [{ id: 'a' }, { id: 'b' }],
          has_more: true,
          next_cursor: 'c2',
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        results: [{ id: 'c' }],
        has_more: false,
        next_cursor: null,
      }), { status: 200 })
    }) as unknown as typeof fetch

    const client = createNotionClient({ token: 'tok', fetchImpl })
    const out = await client.listBlockChildren('parent')
    expect(out.map((b) => (b as { id: string }).id)).toEqual(['a', 'b', 'c'])
  })
})
