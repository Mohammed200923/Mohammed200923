# SkyShift: static app + allow-listed archive proxy, standard library only.
FROM python:3.12-slim
WORKDIR /srv
COPY server.py ./
COPY app ./app
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
USER nobody
CMD ["python3", "server.py"]
