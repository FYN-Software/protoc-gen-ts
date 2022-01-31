FROM namely/protoc-all as build

# Prevents cache
ADD https://www.google.com /time.now

RUN npm --global config set user root
RUN npm --global install @fyn-software/protoc-plugin-ts --force

FROM build as final

COPY --from=build /usr/lib/node_modules /usr/lib/node_modules
COPY --from=build /usr/bin/protoc-gen-ts /usr/bin/protoc-gen-ts

ADD ./entrypoint.sh /usr/local/bin
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT [ "entrypoint.sh" ]