import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RenderDto } from './render.dto';

describe('RenderDto', () => {
  async function validateDto(payload: Record<string, unknown>) {
    const dto = plainToInstance(RenderDto, payload);
    return validate(dto);
  }
  it('should accept valid https URL', async () => {
    const errors = await validateDto({ url: 'https://example.com/page' });
    expect(errors.length).toBe(0);
  });
  it('should accept valid http URL', async () => {
    const errors = await validateDto({ url: 'http://example.com' });
    expect(errors.length).toBe(0);
  });
  it('should reject URL without protocol', async () => {
    const errors = await validateDto({ url: 'example.com' });
    expect(errors.length).toBeGreaterThan(0);
  });
  it('should reject non-http/https protocol', async () => {
    const errors = await validateDto({ url: 'ftp://example.com' });
    expect(errors.length).toBeGreaterThan(0);
  });
  it('should reject empty URL', async () => {
    const errors = await validateDto({ url: '' });
    expect(errors.length).toBeGreaterThan(0);
  });
  it('should reject URL exceeding 2048 characters', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2050);
    const errors = await validateDto({ url: longUrl });
    expect(errors.length).toBeGreaterThan(0);
  });
});
