import { Injectable, ForbiddenException } from '@nestjs/common';
import { assertProductAccess } from '../common/product-access';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { BulkUpdateFieldConfigsDto } from './dto/field-configs.dto';

const ADMIN_ROLES = new Set(['admin', 'supervisor']);
const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);

// Default configs — yangi product uchun avtomatik seed
const DEFAULTS: Record<string, Array<{ fieldKey: string; label: string; visible: boolean; sortOrder: number; displayType: string }>> = {
  tx_table: [
    { fieldKey: 'debit_state',      label: 'Debit holati',       visible: true,  sortOrder: 0,  displayType: 'badge'  },
    { fieldKey: 'credit_state',     label: 'Kredit holati',      visible: true,  sortOrder: 1,  displayType: 'badge'  },
    { fieldKey: 'service',          label: 'Servis',             visible: true,  sortOrder: 2,  displayType: 'text'   },
    { fieldKey: 'debit_amount',     label: 'Debit summa',        visible: true,  sortOrder: 3,  displayType: 'amount' },
    { fieldKey: 'credit_amount',    label: 'Kredit summa',       visible: true,  sortOrder: 4,  displayType: 'amount' },
    { fieldKey: 'paid_at',          label: "To'lab berilgan",    visible: true,  sortOrder: 5,  displayType: 'date'   },
    { fieldKey: 'provider',         label: 'Provayder',          visible: false, sortOrder: 6,  displayType: 'text'   },
    { fieldKey: 'type',             label: 'Tur',                visible: false, sortOrder: 7,  displayType: 'text'   },
    { fieldKey: 'strana',           label: 'Strana',             visible: false, sortOrder: 8,  displayType: 'text'   },
    { fieldKey: 'ext_debit_state',  label: 'Ext debit',          visible: false, sortOrder: 9,  displayType: 'badge'  },
    { fieldKey: 'ext_credit_state', label: 'Ext kredit',         visible: false, sortOrder: 10, displayType: 'badge'  },
  ],
  tx_detail: [
    { fieldKey: 'debit_state',      label: 'Debit holati',       visible: true,  sortOrder: 0,  displayType: 'badge'  },
    { fieldKey: 'credit_state',     label: 'Kredit holati',      visible: true,  sortOrder: 1,  displayType: 'badge'  },
    { fieldKey: 'ext_debit_state',  label: 'Ext debit',          visible: true,  sortOrder: 2,  displayType: 'badge'  },
    { fieldKey: 'ext_credit_state', label: 'Ext kredit',         visible: true,  sortOrder: 3,  displayType: 'badge'  },
    { fieldKey: 'amount',           label: 'Summa',              visible: true,  sortOrder: 4,  displayType: 'amount' },
    { fieldKey: 'debit_amount',     label: 'Debit summa',        visible: true,  sortOrder: 5,  displayType: 'amount' },
    { fieldKey: 'credit_amount',    label: 'Kredit summa',       visible: true,  sortOrder: 6,  displayType: 'amount' },
    { fieldKey: 'currency',         label: 'Valyuta',            visible: true,  sortOrder: 7,  displayType: 'text'   },
    { fieldKey: 'service',          label: 'Servis',             visible: true,  sortOrder: 8,  displayType: 'text'   },
    { fieldKey: 'provider',         label: 'Provayder',          visible: true,  sortOrder: 9,  displayType: 'text'   },
    { fieldKey: 'type',             label: 'Tur',                visible: true,  sortOrder: 10, displayType: 'text'   },
    { fieldKey: 'strana',           label: 'Strana',             visible: true,  sortOrder: 11, displayType: 'text'   },
    { fieldKey: 'phone',            label: 'Telefon',            visible: true,  sortOrder: 12, displayType: 'text'   },
    { fieldKey: 'paid_at',          label: "To'lab berilgan",    visible: true,  sortOrder: 13, displayType: 'date'   },
    { fieldKey: 'fiscal_number',    label: 'Fiskal raqam',       visible: false, sortOrder: 14, displayType: 'text'   },
  ],
  profile: [
    { fieldKey: 'phone',       label: 'Telefon',             visible: true,  sortOrder: 0,  displayType: 'text'  },
    { fieldKey: 'full_name',   label: 'Ismi',                visible: true,  sortOrder: 1,  displayType: 'text'  },
    { fieldKey: 'passport',    label: 'Pasport',             visible: true,  sortOrder: 2,  displayType: 'text'  },
    { fieldKey: 'nationality', label: 'Millat',              visible: true,  sortOrder: 3,  displayType: 'text'  },
    { fieldKey: 'birthdate',   label: "Tug'ilgan sana",      visible: true,  sortOrder: 4,  displayType: 'date'  },
    { fieldKey: 'language',    label: 'Til',                 visible: true,  sortOrder: 5,  displayType: 'text'  },
    { fieldKey: 'uid',         label: 'UID',                 visible: true,  sortOrder: 6,  displayType: 'text'  },
    { fieldKey: 'citizenship', label: 'Fuqarolik',           visible: true,  sortOrder: 7,  displayType: 'text'  },
    { fieldKey: 'identified',  label: 'Identifikatsiya',     visible: true,  sortOrder: 8,  displayType: 'badge' },
    { fieldKey: 'is_blocked',  label: 'Bloklangan',          visible: false, sortOrder: 9,  displayType: 'badge' },
    { fieldKey: 'created',     label: "Ro'yxatdan o'tgan",   visible: true,  sortOrder: 10, displayType: 'date'  },
  ],
};

@Injectable()
export class FieldConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: JwtUser, productId: string, context: string) {
    await assertProductAccess(this.prisma, user, productId);

    const existing = await this.prisma.fieldConfig.findMany({
      where: { productId, context },
      orderBy: { sortOrder: 'asc' },
    });

    // Yangi product uchun default seed
    if (existing.length === 0 && DEFAULTS[context]) {
      await this.seedDefaults(productId, context);
      return this.prisma.fieldConfig.findMany({
        where: { productId, context },
        orderBy: { sortOrder: 'asc' },
      });
    }

    return existing;
  }

  async bulkUpdate(user: JwtUser, productId: string, dto: BulkUpdateFieldConfigsDto) {
    if (!ADMIN_ROLES.has(user.role)) throw new ForbiddenException();
    await assertProductAccess(this.prisma, user, productId);

    // Upsert har bir item
    await Promise.all(
      dto.items.map((item) =>
        this.prisma.fieldConfig.upsert({
          where: {
            productId_context_fieldKey: {
              productId,
              context: dto.context,
              fieldKey: item.fieldKey,
            },
          },
          create: {
            productId,
            context: dto.context,
            fieldKey: item.fieldKey,
            label: item.label,
            visible: item.visible,
            sortOrder: item.sortOrder,
            displayType: item.displayType,
          },
          update: {
            label: item.label,
            visible: item.visible,
            sortOrder: item.sortOrder,
            displayType: item.displayType,
          },
        }),
      ),
    );

    return this.list(user, productId, dto.context);
  }

  private async seedDefaults(productId: string, context: string) {
    const defs = DEFAULTS[context] ?? [];
    await Promise.all(
      defs.map((d) =>
        this.prisma.fieldConfig.upsert({
          where: { productId_context_fieldKey: { productId, context, fieldKey: d.fieldKey } },
          create: { productId, context, ...d },
          update: {},
        }),
      ),
    );
  }
}
