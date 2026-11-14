# SkyShift on a Hugging Face Docker Space: four flat files (README.md, Dockerfile,
# server.py, index.html), because the Space's web uploader drops folders.
FROM python:3.12-slim
WORKDIR /srv
COPY server.py ./
COPY index.html ./app/index.html
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
USER nobody
CMD ["python3", "server.py"]
