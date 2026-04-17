import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../utils/cn';
import { getDashboardV2MotionDuration } from '../foundation/motion';
import { DashboardV2Icon } from './Icon';

type DrawerPlacement = 'right' | 'bottom';

export interface DashboardV2DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  placement?: DrawerPlacement;
}

export function DashboardV2Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  placement = 'right',
}: DashboardV2DrawerProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const animationDuration = getDashboardV2MotionDuration(prefersReducedMotion, 'slow');

  return (
    <ModalOverlay
      className="v2-drawer__overlay"
      isDismissable
      isOpen={open}
      onOpenChange={onOpenChange}
    >
      <Modal
        className={cn('v2-drawer', `v2-drawer--${placement}`)}
        style={{
          transitionDuration: `${animationDuration}ms`,
        }}
      >
        <Dialog className="v2-drawer__dialog">
          {({ close }) => (
            <>
              <header className="v2-drawer__header">
                <div className="v2-drawer__heading">
                  <Heading slot="title" className="v2-drawer__title">
                    {title}
                  </Heading>
                  {description ? <p className="v2-drawer__description">{description}</p> : null}
                </div>
                <Button className="v2-drawer__close" onPress={close} aria-label="Close panel">
                  <DashboardV2Icon icon={X} size={16} />
                </Button>
              </header>
              <div className="v2-drawer__content">{children}</div>
              {footer ? <footer className="v2-drawer__footer">{footer}</footer> : null}
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
