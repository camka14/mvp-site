import { logServerError, type ErrorLogContext } from '@/server/http/errorLogging';

type BillingErrorLogContext = ErrorLogContext & {
  discountCode?: string | null;
};

export const logBillingError = ({
  route,
  stage,
  status,
  error,
  context,
}: {
  route: string;
  stage: string;
  status: number;
  error: unknown;
  context?: BillingErrorLogContext;
}) => {
  logServerError({
    message: 'Billing request failed',
    error,
    route,
    stage,
    status,
    context,
  });
};
