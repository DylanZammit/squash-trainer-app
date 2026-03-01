FROM nginx:alpine

# Copy static frontend files
COPY . /usr/share/nginx/html

# Replace default nginx config with our SPA + proxy config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
