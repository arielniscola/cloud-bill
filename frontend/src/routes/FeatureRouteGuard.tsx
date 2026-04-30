import { Outlet } from 'react-router-dom';
import FeatureGuard from '../components/shared/FeatureGuard';
import type { FeatureKey } from '../utils/planFeatures';

interface FeatureRouteGuardProps {
  feature: FeatureKey;
}

/** Route-level guard. Renders FeatureGuard's lock screen if the company plan doesn't include the feature. */
export default function FeatureRouteGuard({ feature }: FeatureRouteGuardProps) {
  return (
    <FeatureGuard feature={feature}>
      <Outlet />
    </FeatureGuard>
  );
}
