const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function importData() {
  try {
    const jsonPath = path.resolve(__dirname, '../chrome_extensions/job-scraper/interview_questions.json')
    const rawData = fs.readFileSync(jsonPath, 'utf8')
    const questions = JSON.parse(rawData)

    console.log(`Found ${questions.length} questions in JSON.`)

    // Clear existing data
    await prisma.questionBank.deleteMany({})
    console.log('Cleared existing QuestionBank data.')

    // Transform data
    const batch = questions.map(q => {
      // Handle tags
      let parsedTags = []
      if (q.tags) {
        parsedTags = q.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean)
      }

      return {
        id: q.id || undefined,
        serialNo: q.serialNo ? String(q.serialNo) : null,
        title: q.title || 'Untitled',
        themeCategory: q.themeCategory || null,
        subCategory: q.subCategory || null,
        tags: parsedTags.length > 0 ? JSON.stringify(parsedTags) : null,
        answer: q.answer || null,
        createdAt: q.createdAt ? new Date(q.createdAt) : new Date(),
        updatedAt: q.updatedAt ? new Date(q.updatedAt) : new Date()
      }
    })

    console.log('Inserting into database...')
    const result = await prisma.questionBank.createMany({
      data: batch
    })

    console.log(`Successfully imported ${result.count} questions.`)
  } catch (error) {
    console.error('Error importing data:', error)
  } finally {
    await prisma.$disconnect()
  }
}

importData()
