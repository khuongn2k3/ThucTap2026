FROM php:8.2-cli

# System deps
RUN apt-get update && apt-get install -y \
    git unzip zip libzip-dev \
    && docker-php-ext-install pdo pdo_mysql zip \
    && rm -rf /var/lib/apt/lists/*

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Copy source
COPY . .

# Install PHP deps
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Create storage symlink (AFTER vendor exists)
RUN php artisan storage:link || true

# Run app
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
