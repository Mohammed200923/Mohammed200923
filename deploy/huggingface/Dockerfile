# SkyShift on a Hugging Face Docker Space. The Space holds only README.md and this file:
# the build downloads the whole project (all three interfaces and server.py) from GitHub,
# because the Space's web uploader drops folders. To deploy a new version, push to GitHub,
# then use "Factory rebuild" in the Space settings. The GitHub repository must be public.
FROM python:3.12-slim
ARG REPO=Mohammed200923/Mohammed200923
ARG REF=claude/brave-planck-ixz21k
WORKDIR /srv
ADD https://codeload.github.com/${REPO}/tar.gz/refs/heads/${REF} /tmp/src.tgz
RUN tar -xzf /tmp/src.tgz --strip-components=1 -C /srv \
 && rm /tmp/src.tgz \
 && test -f /srv/server.py && test -f /srv/app/index.html
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
USER nobody
CMD ["python3", "server.py"]
