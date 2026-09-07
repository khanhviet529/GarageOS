'use client';

import { Component, type ReactNode } from 'react';

/**
 * Error boundary cục bộ cho viewer (P1-LND-014): viewer lỗi KHÔNG được kéo sập
 * cả trang chi tiết — gallery/text/CTA/form vẫn hoạt động.
 */
export class ViewerErrorBoundary extends Component<
  { children: ReactNode; fallback: string },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return <p className="viewer-hint" role="alert">{this.props.fallback}</p>;
    }
    return this.props.children;
  }
}
