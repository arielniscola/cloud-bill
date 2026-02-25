import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DollarSign, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Badge, Button, Modal, Input, Select } from '../../components/ui';
import { PageHeader, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { currentAccountsService, customersService } from '../../services';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { CURRENCY_OPTIONS, DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Customer, CurrentAccount, AccountMovement, Currency } from '../../types';

const paymentSchema = z.object({
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  description: z.string().optional(),
});

const creditLimitSchema = z.object({
  creditLimit: z.coerce.number().min(0, 'El límite debe ser mayor o igual a 0').nullable(),
});

type PaymentFormData = z.output<typeof paymentSchema>;
type CreditLimitFormData = z.output<typeof creditLimitSchema>;

export default function AccountDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accounts, setAccounts] = useState<CurrentAccount[]>([]);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('ARS');
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>('ARS');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as any,
  });

  const creditForm = useForm<CreditLimitFormData>({
    resolver: zodResolver(creditLimitSchema) as any,
  });

  const fetchData = useCallback(async () => {
    if (!customerId) return;
    setIsLoading(true);
    try {
      const [customerData, accountsData] = await Promise.all([
        customersService.getById(customerId),
        currentAccountsService.getByCustomerId(customerId),
      ]);
      setCustomer(customerData);
      setAccounts(accountsData);

      // Fetch movements for selected currency
      const selectedAccount = accountsData.find((a: CurrentAccount) => a.currency === selectedCurrency);
      if (selectedAccount) {
        const movementsData = await currentAccountsService.getMovements(customerId, {
          page,
          limit,
          currency: selectedCurrency,
        });
        setMovements(movementsData.data);
        setTotal(movementsData.total);
      } else {
        setMovements([]);
        setTotal(0);
      }
    } catch (error) {
      toast.error('Error al cargar cuenta corriente');
      navigate('/current-accounts');
    } finally {
      setIsLoading(false);
    }
  }, [customerId, page, limit, selectedCurrency, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePayment = async (data: PaymentFormData) => {
    if (!customerId) return;
    setIsSaving(true);
    try {
      await currentAccountsService.registerPayment(customerId, {
        ...data,
        currency: paymentCurrency,
      });
      toast.success('Pago registrado');
      setIsPaymentModalOpen(false);
      paymentForm.reset();
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreditLimit = async (data: CreditLimitFormData) => {
    if (!customerId) return;
    setIsSaving(true);
    try {
      await currentAccountsService.setCreditLimit(customerId, {
        creditLimit: data.creditLimit,
      });
      toast.success('Límite de crédito actualizado');
      setIsCreditModalOpen(false);
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al actualizar límite');
    } finally {
      setIsSaving(false);
    }
  };

  const arsAccount = accounts.find((a) => a.currency === 'ARS');
  const usdAccount = accounts.find((a) => a.currency === 'USD');

  const columns: Column<AccountMovement>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (mov) => formatDateTime(mov.createdAt),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (mov) => (
        <Badge variant={mov.type === 'CREDIT' ? 'success' : 'error'}>
          {mov.type === 'CREDIT' ? 'Crédito' : 'Débito'}
        </Badge>
      ),
    },
    { key: 'description', header: 'Descripción' },
    {
      key: 'amount',
      header: 'Monto',
      render: (mov) => (
        <span className={mov.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}>
          {mov.type === 'CREDIT' ? '+' : '-'}
          {formatCurrency(mov.amount, selectedCurrency)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Saldo',
      render: (mov) => formatCurrency(mov.balance, selectedCurrency),
    },
  ];

  if (isLoading && !customer) {
    return <div className="p-6">Cargando...</div>;
  }

  if (!customer) {
    return <div className="p-6">Cargando...</div>;
  }

  const getBalanceStatus = (balance: number) =>
    balance > 0 ? 'deudor' : balance < 0 ? 'acreedor' : 'saldado';

  const renderAccountCard = (account: CurrentAccount | undefined, currency: Currency) => {
    const balance = account?.balance ?? 0;
    const balanceStatus = getBalanceStatus(balance);

    return (
      <Card>
        <p className="text-sm text-gray-500">Saldo {currency}</p>
        <p
          className={`text-2xl font-bold ${
            balance > 0
              ? 'text-red-600'
              : balance < 0
              ? 'text-green-600'
              : 'text-gray-900'
          }`}
        >
          {formatCurrency(Math.abs(balance), currency)}
        </p>
        <Badge
          variant={
            balanceStatus === 'deudor'
              ? 'error'
              : balanceStatus === 'acreedor'
              ? 'success'
              : 'default'
          }
          className="mt-2"
        >
          {balanceStatus === 'deudor'
            ? 'Cliente debe'
            : balanceStatus === 'acreedor'
            ? 'A favor del cliente'
            : 'Sin saldo'}
        </Badge>
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        title={`Cuenta Corriente - ${customer.name}`}
        backTo="/current-accounts"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsCreditModalOpen(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Límite de crédito
            </Button>
            <Button onClick={() => setIsPaymentModalOpen(true)}>
              <DollarSign className="w-4 h-4 mr-2" />
              Registrar pago
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        {renderAccountCard(arsAccount, 'ARS')}
        {renderAccountCard(usdAccount, 'USD')}

        <Card>
          <p className="text-sm text-gray-500">CUIT/CUIL</p>
          <p className="text-lg font-medium text-gray-900">
            {customer.taxId || '-'}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-gray-500">Email</p>
          <p className="text-lg font-medium text-gray-900">
            {customer.email || '-'}
          </p>
        </Card>
      </div>

      <Card padding="none">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Historial de movimientos
          </h3>
          <Select
            options={CURRENCY_OPTIONS}
            value={selectedCurrency}
            onChange={(value) => {
              setSelectedCurrency(value as Currency);
              setPage(1);
            }}
            className="w-48"
          />
        </div>
        <DataTable
          columns={columns}
          data={movements}
          isLoading={isLoading}
          keyExtractor={(mov) => mov.id}
          emptyMessage="No hay movimientos registrados"
          pagination={{
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (newLimit) => {
              setLimit(newLimit);
              setPage(1);
            },
          }}
        />
      </Card>

      {/* Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Registrar pago"
      >
        <form
          onSubmit={paymentForm.handleSubmit(handlePayment)}
          className="space-y-4"
        >
          <Select
            label="Moneda"
            options={CURRENCY_OPTIONS}
            value={paymentCurrency}
            onChange={(value) => setPaymentCurrency(value as Currency)}
          />

          <Input
            label="Monto *"
            type="number"
            step="0.01"
            {...paymentForm.register('amount')}
            error={paymentForm.formState.errors.amount?.message}
          />

          <Input
            label="Descripción"
            {...paymentForm.register('description')}
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isSaving}>
              Registrar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPaymentModalOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Credit Limit Modal */}
      <Modal
        isOpen={isCreditModalOpen}
        onClose={() => setIsCreditModalOpen(false)}
        title="Límite de crédito"
      >
        <form
          onSubmit={creditForm.handleSubmit(handleCreditLimit)}
          className="space-y-4"
        >
          <Input
            label="Límite de crédito"
            type="number"
            step="0.01"
            placeholder="Dejar vacío para sin límite"
            {...creditForm.register('creditLimit')}
            error={creditForm.formState.errors.creditLimit?.message}
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={isSaving}>
              Guardar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreditModalOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
