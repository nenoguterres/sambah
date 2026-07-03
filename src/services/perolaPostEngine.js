import { getSalesReportMock } from './salesReportService.js';
import { generateSalesInsights } from './insightService.js';
import { generatePostIdeasFromInsights } from './postEngineService.js';

export function generatePerolaPosts() {
  const report = getSalesReportMock();
  const insights = generateSalesInsights(report);
  const postIdeas = generatePostIdeasFromInsights(insights);

  return {
    generatedAt: new Date().toISOString(),
    source: 'mock-sales-report',
    module: 'perola-post-engine',
    report,
    insights,
    postIdeas,
    stats: {
      ideasGenerated: postIdeas.length,
      insightsGenerated: Array.isArray(insights.insights) ? insights.insights.length : 0,
      averageIdeaScore: postIdeas.length
        ? Math.round(postIdeas.reduce((sum, idea) => sum + Number(idea.score || 0), 0) / postIdeas.length)
        : 0,
    },
  };
}
