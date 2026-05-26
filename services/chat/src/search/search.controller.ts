import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MeilisearchService } from '../meilisearch/meilisearch.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SearchDto } from './search.dto';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly meili: MeilisearchService) {}

  @Get()
  search(@Query() dto: SearchDto) {
    return this.meili.search(dto.q, {
      roomId: dto.roomId,
      senderId: dto.senderId,
      type: dto.type,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
    }, dto.limit, dto.offset);
  }
}
