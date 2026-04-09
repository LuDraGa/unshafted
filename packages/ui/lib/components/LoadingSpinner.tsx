interface ILoadingSpinnerProps {
  size?: number;
}

export const LoadingSpinner = ({ size }: ILoadingSpinnerProps) => (
  <div className="flex min-h-screen items-center justify-center">
    <div
      className="animate-spin rounded-full border-[3px] border-stone-300 border-t-stone-900"
      style={{ width: size ?? 48, height: size ?? 48 }}
    />
  </div>
);
