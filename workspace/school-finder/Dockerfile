FROM nginx:alpine
COPY out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN chmod -R 644 /usr/share/nginx/html && find /usr/share/nginx/html -type d -exec chmod 755 {} +
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
