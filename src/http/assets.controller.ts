import { Body, Controller, Get, Post } from '@nestjs/common';
import { AssetsService } from '../infrastructure/assets.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get('overview') overview() { return this.assets.overview(); }
  @Get('equipment') equipment() { return this.assets.listEquipment(); }
  @Get('warehouses') warehouses() { return this.assets.listWarehouses(); }
  @Get('stock') stock() { return this.assets.listStock(); }
  @Get('nomenclature') nomenclature() { return this.assets.listNomenclature(); }
  @Get('movements') movements() { return this.assets.listMovements(); }
  @Get('receipts') receipts() { return this.assets.listReceipts(); }
  @Get('integrations') integrations() { return this.assets.listIntegrations(); }
  @Post('equipment') createEquipment(@Body() body: Parameters<AssetsService['createEquipment']>[0]) { return this.assets.createEquipment(body); }
  @Post('warehouses') createWarehouse(@Body() body: Parameters<AssetsService['createWarehouse']>[0]) { return this.assets.createWarehouse(body); }
  @Post('stock') upsertStock(@Body() body: Parameters<AssetsService['upsertStock']>[0]) { return this.assets.upsertStock(body); }
  @Post('nomenclature') createNomenclature(@Body() body: Parameters<AssetsService['createNomenclature']>[0]) { return this.assets.createNomenclature(body); }
  @Post('movements') createMovement(@Body() body: Parameters<AssetsService['createMovement']>[0]) { return this.assets.createMovement(body); }
  @Post('receipts') createReceipt(@Body() body: Parameters<AssetsService['createReceipt']>[0]) { return this.assets.createReceipt(body); }
  @Post('integrations') createIntegration(@Body() body: Parameters<AssetsService['createIntegration']>[0]) { return this.assets.createIntegration(body); }
}
