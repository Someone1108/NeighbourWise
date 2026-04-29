const VARIANT_CLASSES = {
  primary: 'nwBtn nwBtnPrimary',
  accent: 'nwBtn nwBtnAccent',
  dark: 'nwBtn nwBtnDark',
  outline: 'nwBtn nwBtnOutline',
  secondary: 'nwBtn',
}

export default function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}) {
  const variantClass = VARIANT_CLASSES[variant] || 'nwBtn'

  return (
    <button className={`${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

