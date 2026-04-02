export default function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}) {
  const variantClass =
    variant === 'primary' ? 'nwBtn nwBtnPrimary' : 'nwBtn'

  return (
    <button className={`${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

