import { validate } from 'class-validator';
import { InitiateCallDto } from './calls.dto';

describe('Inbound call product validation', () => {
  it.each([undefined, null, '', 'not-a-uuid'])('rejects missing or invalid product IDs: %s', async productId => {
    const dto = Object.assign(new InitiateCallDto(), { productId });
    const errors = await validate(dto);
    expect(errors.some(error => error.property === 'productId')).toBe(true);
  });

  it('accepts a product UUID', async () => {
    const dto = Object.assign(new InitiateCallDto(), { productId: '00000000-0000-4000-8000-000000000002' });
    await expect(validate(dto)).resolves.toEqual([]);
  });
});
