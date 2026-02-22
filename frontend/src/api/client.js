import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

export const podcastApi = {
  // Add a podcast from RSS feed
  addFromFeed: (feedUrl, autoAnalyze = false) =>
    api.post('/podcasts/feed', { feed_url: feedUrl, auto_analyze: autoAnalyze }),

  // List all podcasts
  list: () =>
    api.get('/podcasts'),

  // Get a single podcast with episodes
  get: (id) =>
    api.get(`/podcasts/${id}`),

  // Update podcast settings
  update: (id, data) =>
    api.patch(`/podcasts/${id}`, data),

  // Delete a podcast
  delete: (id) =>
    api.delete(`/podcasts/${id}`),

  // Refresh a podcast feed
  refresh: (id) =>
    api.post(`/podcasts/${id}/refresh`),

  // Get a specific episode
  getEpisode: (podcastId, episodeId) =>
    api.get(`/podcasts/${podcastId}/episodes/${episodeId}`),

  // Discover similar podcasts via iTunes
  discover: () =>
    api.get('/podcasts/discover/similar'),

  // Search podcasts by keyword via iTunes
  search: (q) =>
    api.get('/podcasts/search', { params: { q } })
}

export const analysisApi = {
  // Start analysis of an episode
  analyze: (podcastId, episodeId) =>
    api.post(`/podcasts/${podcastId}/episodes/${episodeId}/analyze`),

  // Batch analyze episodes
  batchAnalyze: (period, podcastIds = null, startDate = null, endDate = null) =>
    api.post('/analysis/batch', {
      period,
      podcast_ids: podcastIds,
      start_date: startDate,
      end_date: endDate
    }),

  // Get episode summary
  getSummary: (episodeId) =>
    api.get(`/episodes/${episodeId}/summary`),

  // Get structured analysis
  getAnalysis: (episodeId) =>
    api.get(`/episodes/${episodeId}/analysis`),

  // Get analysis status
  getStatus: (episodeId) =>
    api.get(`/episodes/${episodeId}/status`),

  // List episodes with filters
  listEpisodes: (params = {}) =>
    api.get('/episodes', { params }),

  // Get analysis progress for real-time updates
  getProgress: (episodeIds = null) =>
    api.get('/analysis/progress', {
      params: episodeIds ? { episode_ids: episodeIds.join(',') } : {}
    })
}

export const digestApi = {
  // Create a new digest
  create: (period, title = null, podcastIds = null, startDate = null, endDate = null) =>
    api.post('/digests', {
      period,
      title,
      podcast_ids: podcastIds,
      start_date: startDate,
      end_date: endDate
    }),

  // List all digests
  list: (skip = 0, limit = 20) =>
    api.get('/digests', { params: { skip, limit } }),

  // Get a single digest
  get: (id) =>
    api.get(`/digests/${id}`),

  // Delete a digest
  delete: (id) =>
    api.delete(`/digests/${id}`),

  // Regenerate digest image with a new artist style
  regenerateImage: (id) =>
    api.post(`/digests/${id}/regenerate-image`)
}

export const schedulerApi = {
  // Get scheduler status
  getStatus: () =>
    api.get('/scheduler/status'),

  // Trigger manual refresh
  triggerRefresh: () =>
    api.post('/scheduler/refresh')
}

export default api
