import PDFDocument from 'pdfkit'

interface QuestionDef {
  type: 'rating' | 'text' | 'multiple_choice'
  label: string
  options: string[]
  required: boolean
}

interface ResponseData {
  respondentName: string
  respondentEmail: string
  formation: string
  answers: { questionIndex: number; value: string }[]
  submittedAt: Date | string
}

interface GenerateParams {
  title: string
  description: string
  questions: QuestionDef[]
  response: ResponseData
}

export async function generateQuestionnairePdf({ title, description, questions, response }: GenerateParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)

    // Header
    pdf.fontSize(20).fillColor('#0ea5e9').text('QUESTIONNAIRE DE SATISFACTION', { align: 'center' })
    pdf.moveDown(0.3)
    pdf.fontSize(14).fillColor('#1e293b').text(title, { align: 'center' })
    if (description) {
      pdf.moveDown(0.2)
      pdf.fontSize(9).fillColor('#64748b').text(description, { align: 'center' })
    }
    pdf.moveDown(0.5)

    // Separator
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor('#e2e8f0').lineWidth(1).stroke()
    pdf.moveDown(0.8)

    // Respondent info
    pdf.fontSize(11).fillColor('#1e293b').text('Informations du participant', { underline: true })
    pdf.moveDown(0.3)
    pdf.fontSize(10).fillColor('#334155')
    pdf.text(`Nom : ${response.respondentName}`)
    pdf.text(`Email : ${response.respondentEmail}`)
    if (response.formation) pdf.text(`Formation : ${response.formation}`)
    const date = new Date(response.submittedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    pdf.text(`Date de soumission : ${date}`)
    pdf.moveDown(1)

    // Separator
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor('#e2e8f0').lineWidth(1).stroke()
    pdf.moveDown(0.8)

    // Answers
    pdf.fontSize(11).fillColor('#1e293b').text('Reponses', { underline: true })
    pdf.moveDown(0.5)

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const answer = response.answers.find((a) => a.questionIndex === i)
      const val = answer?.value || '—'

      // Question number + label
      pdf.fontSize(10).fillColor('#0ea5e9').text(`${i + 1}. ${q.label}`, { continued: false })
      pdf.moveDown(0.2)

      if (q.type === 'rating') {
        const rating = parseInt(val) || 0
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating)
        pdf.fontSize(14).fillColor('#f59e0b').text(stars)
        pdf.fontSize(9).fillColor('#64748b').text(`${rating}/5`)
      } else if (q.type === 'multiple_choice') {
        pdf.fontSize(10).fillColor('#334155').text(`→ ${val}`)
      } else {
        pdf.fontSize(10).fillColor('#334155').text(val || 'Aucune reponse', { width: 460 })
      }

      pdf.moveDown(0.6)

      // Page break if needed
      if (pdf.y > 700) pdf.addPage()
    }

    // Footer
    pdf.moveDown(1)
    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor('#e2e8f0').lineWidth(1).stroke()
    pdf.moveDown(0.5)
    pdf.fontSize(8).fillColor('#94a3b8').text('Document genere automatiquement — Venio Formatio / Qualiopi', { align: 'center' })

    pdf.end()
  })
}
