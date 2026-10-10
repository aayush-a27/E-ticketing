import { describe, it, expect, beforeEach } from 'vitest';
import { api, createShowRunner, createSuperAdmin, createUser, signInAs, moviePayload } from '../helpers.js';
import { Movie } from '../../src/models/Movie.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { MOVIE_STATUS } from '../../src/constants/index.js';

async function adminAgent() {
  const admin = await createSuperAdmin({ email: `admin-${Math.random().toString(36).slice(2, 8)}@example.com` });
  return signInAs(admin);
}

beforeEach(() => {
  memoryProvider.__reset();
});

describe('movie authoring', () => {
  it('creates a draft with a derived slug', async () => {
    const agent = await adminAgent();

    const response = await agent.post('/api/v1/admin/movies').send(moviePayload());

    expect(response.status).toBe(201);
    expect(response.body.data.movie).toMatchObject({
      title: 'The Long Afternoon',
      slug: 'the-long-afternoon',
      status: MOVIE_STATUS.DRAFT,
    });
  });

  it('makes a colliding slug unique instead of failing', async () => {
    const agent = await adminAgent();

    await agent.post('/api/v1/admin/movies').send(moviePayload());
    const second = await agent.post('/api/v1/admin/movies').send(moviePayload());

    expect(second.status).toBe(201);
    expect(second.body.data.movie.slug).toBe('the-long-afternoon-2');
  });

  it('rejects an explicit slug that is taken', async () => {
    const agent = await adminAgent();
    await agent.post('/api/v1/admin/movies').send(moviePayload({ slug: 'taken' }));

    const second = await agent
      .post('/api/v1/admin/movies')
      .send(moviePayload({ title: 'Another Film', slug: 'taken' }));

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SLUG_IN_USE');
  });

  it('validates the payload', async () => {
    const agent = await adminAgent();

    const response = await agent.post('/api/v1/admin/movies').send(
      moviePayload({ runtimeMinutes: 0, certification: 'XX', languages: [], synopsis: 'short' }),
    );

    expect(response.status).toBe(400);
    const fields = response.body.error.details.map((detail) => detail.field);
    expect(fields).toEqual(expect.arrayContaining(['runtimeMinutes', 'certification', 'languages']));
  });

  it('updates a movie and records the change', async () => {
    const agent = await adminAgent();
    const created = await agent.post('/api/v1/admin/movies').send(moviePayload());
    const id = created.body.data.movie._id;

    const response = await agent
      .patch(`/api/v1/admin/movies/${id}`)
      .send({ runtimeMinutes: 148, tagline: 'Every morning, the same train.' });

    expect(response.status).toBe(200);
    expect(response.body.data.movie.runtimeMinutes).toBe(148);

    const audit = await AuditLog.findOne({ action: 'movie.updated' });
    expect(audit.before.runtimeMinutes).toBe(120);
    expect(audit.after.runtimeMinutes).toBe(148);
  });

  /** status is not in the update schema, so it cannot be set this way. */
  it('ignores a status sent to the update endpoint', async () => {
    const agent = await adminAgent();
    const created = await agent.post('/api/v1/admin/movies').send(moviePayload());
    const id = created.body.data.movie._id;

    await agent.patch(`/api/v1/admin/movies/${id}`).send({ status: MOVIE_STATUS.PUBLISHED });

    const movie = await Movie.findById(id);
    expect(movie.status).toBe(MOVIE_STATUS.DRAFT);
  });
});

describe('movie publication', () => {
  async function draftWithPoster(agent) {
    const created = await agent.post('/api/v1/admin/movies').send(moviePayload());
    const id = created.body.data.movie._id;
    const asset = memoryProvider.__seed(`poster-${id}`);
    await agent.post(`/api/v1/admin/movies/${id}/media`).send({ kind: 'poster', publicId: asset.publicId });
    return id;
  }

  it('refuses to publish without a poster', async () => {
    const agent = await adminAgent();
    const created = await agent.post('/api/v1/admin/movies').send(moviePayload());

    const response = await agent
      .post(`/api/v1/admin/movies/${created.body.data.movie._id}/publish`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.details.map((detail) => detail.field)).toContain('poster');
  });

  it('publishes once the required details are present', async () => {
    const agent = await adminAgent();
    const id = await draftWithPoster(agent);

    const response = await agent.post(`/api/v1/admin/movies/${id}/publish`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.movie.status).toBe(MOVIE_STATUS.PUBLISHED);
    expect(response.body.data.movie.publishedAt).toBeTruthy();
  });

  it('unpublishes back to draft', async () => {
    const agent = await adminAgent();
    const id = await draftWithPoster(agent);
    await agent.post(`/api/v1/admin/movies/${id}/publish`).send({});

    const response = await agent.post(`/api/v1/admin/movies/${id}/unpublish`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.movie.status).toBe(MOVIE_STATUS.DRAFT);
  });

  it('archives a movie with no upcoming shows', async () => {
    const agent = await adminAgent();
    const id = await draftWithPoster(agent);

    const response = await agent.post(`/api/v1/admin/movies/${id}/archive`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.movie.status).toBe(MOVIE_STATUS.ARCHIVED);
  });
});

describe('media attachment', () => {
  it('refuses a publicId the provider does not know', async () => {
    const agent = await adminAgent();
    const created = await agent.post('/api/v1/admin/movies').send(moviePayload());

    const response = await agent
      .post(`/api/v1/admin/movies/${created.body.data.movie._id}/media`)
      .send({ kind: 'poster', publicId: 'invented-by-the-client' });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('publicId');
  });

  it('stores the asset the provider reports, not what the client claims', async () => {
    const agent = await adminAgent();
    const created = await agent.post('/api/v1/admin/movies').send(moviePayload());
    const id = created.body.data.movie._id;
    memoryProvider.__seed('real-poster', { width: 800, height: 1200 });

    await agent.post(`/api/v1/admin/movies/${id}/media`).send({
      kind: 'poster',
      publicId: 'real-poster',
      url: 'https://evil.example/override.jpg',
    });

    const movie = await Movie.findById(id);
    expect(movie.poster.url).toBe('https://media.test/real-poster.jpg');
    expect(movie.poster.width).toBe(800);
  });

  it('deletes the replaced asset when a poster is swapped', async () => {
    const agent = await adminAgent();
    const created = await agent.post('/api/v1/admin/movies').send(moviePayload());
    const id = created.body.data.movie._id;

    memoryProvider.__seed('first-poster');
    memoryProvider.__seed('second-poster');

    await agent.post(`/api/v1/admin/movies/${id}/media`).send({ kind: 'poster', publicId: 'first-poster' });
    await agent.post(`/api/v1/admin/movies/${id}/media`).send({ kind: 'poster', publicId: 'second-poster' });

    expect(await memoryProvider.getAsset('first-poster')).toBeNull();
    expect(await memoryProvider.getAsset('second-poster')).not.toBeNull();
  });

  it('issues a scoped upload signature', async () => {
    const agent = await adminAgent();

    const response = await agent
      .post('/api/v1/admin/uploads/signature')
      .send({ purpose: 'movie_poster' });

    expect(response.status).toBe(200);
    expect(response.body.data.upload.folder).toBe('cinereserve/movies/posters');
    // Relative to the folder: the provider joins them, so repeating the
    // folder here would store the file under a doubled path.
    expect(response.body.data.upload.public_id).not.toContain('cinereserve/');
    expect(response.body.data.upload.public_id).toMatch(/^new-[0-9a-f-]{36}$/);
    expect(response.body.data.upload.signature).toBeTruthy();
    expect(response.body.data.constraints.allowedFormats).toContain('jpg');
    // The secret is never part of the response.
    expect(JSON.stringify(response.body)).not.toContain('api_secret');
  });
});

describe('who may touch the catalog', () => {
  it('refuses a customer', async () => {
    const customer = await createUser({ email: 'cat-customer@example.com' });
    const agent = await signInAs(customer);

    expect((await agent.post('/api/v1/admin/movies').send(moviePayload())).status).toBe(403);
    expect((await agent.get('/api/v1/admin/movies')).status).toBe(403);
  });

  /** Show runners schedule published movies; they do not author the catalog. */
  it('refuses a show runner', async () => {
    const runner = await createShowRunner({ email: 'cat-runner@example.com' });
    const agent = await signInAs(runner);

    expect((await agent.post('/api/v1/admin/movies').send(moviePayload())).status).toBe(403);
  });
});

describe('the public catalog', () => {
  it('lists only published movies', async () => {
    const agent = await adminAgent();

    const draft = await agent.post('/api/v1/admin/movies').send(moviePayload({ title: 'Still A Draft' }));
    const published = await agent.post('/api/v1/admin/movies').send(moviePayload({ title: 'Out Now' }));
    const id = published.body.data.movie._id;
    memoryProvider.__seed(`p-${id}`);
    await agent.post(`/api/v1/admin/movies/${id}/media`).send({ kind: 'poster', publicId: `p-${id}` });
    await agent.post(`/api/v1/admin/movies/${id}/publish`).send({});

    const response = await api().get('/api/v1/movies');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe('Out Now');
    expect(response.body.data.map((movie) => movie.id)).not.toContain(draft.body.data.movie._id);
  });

  it('404s on a draft fetched by slug, with no hint that it exists', async () => {
    const agent = await adminAgent();
    await agent.post('/api/v1/admin/movies').send(moviePayload({ slug: 'secret-film' }));

    const response = await api().get('/api/v1/movies/secret-film');
    expect(response.status).toBe(404);
  });

  it('hides internal fields from the public shape', async () => {
    const agent = await adminAgent();
    const created = await agent.post('/api/v1/admin/movies').send(moviePayload());
    const id = created.body.data.movie._id;
    memoryProvider.__seed(`pub-${id}`);
    await agent.post(`/api/v1/admin/movies/${id}/media`).send({ kind: 'poster', publicId: `pub-${id}` });
    await agent.post(`/api/v1/admin/movies/${id}/publish`).send({});

    const response = await api().get('/api/v1/movies/the-long-afternoon');

    expect(response.status).toBe(200);
    const movie = response.body.data.movie;
    expect(movie.poster.url).toBeTruthy();
    expect(movie.poster.publicId).toBeUndefined();
    expect(movie.createdBy).toBeUndefined();
    expect(movie.status).toBeUndefined();
  });

  it('filters by language and genre', async () => {
    const agent = await adminAgent();
    for (const [title, languages, genres] of [
      ['Hindi Drama', ['Hindi'], ['Drama']],
      ['Tamil Action', ['Tamil'], ['Action']],
    ]) {
      const created = await agent
        .post('/api/v1/admin/movies')
        .send(moviePayload({ title, languages, genres }));
      const id = created.body.data.movie._id;
      memoryProvider.__seed(`f-${id}`);
      await agent.post(`/api/v1/admin/movies/${id}/media`).send({ kind: 'poster', publicId: `f-${id}` });
      await agent.post(`/api/v1/admin/movies/${id}/publish`).send({});
    }

    const hindi = await api().get('/api/v1/movies?language=Hindi');
    expect(hindi.body.data).toHaveLength(1);
    expect(hindi.body.data[0].title).toBe('Hindi Drama');

    const action = await api().get('/api/v1/movies?genre=Action');
    expect(action.body.data).toHaveLength(1);
    expect(action.body.data[0].title).toBe('Tamil Action');
  });

  it('paginates', async () => {
    const agent = await adminAgent();
    for (let index = 0; index < 3; index += 1) {
      const created = await agent
        .post('/api/v1/admin/movies')
        .send(moviePayload({ title: `Film ${index}` }));
      const id = created.body.data.movie._id;
      memoryProvider.__seed(`g-${id}`);
      await agent.post(`/api/v1/admin/movies/${id}/media`).send({ kind: 'poster', publicId: `g-${id}` });
      await agent.post(`/api/v1/admin/movies/${id}/publish`).send({});
    }

    const response = await api().get('/api/v1/movies?limit=2&page=1');

    expect(response.body.data).toHaveLength(2);
    expect(response.body.pagination).toMatchObject({ total: 3, totalPages: 2, hasNext: true });
  });
});
