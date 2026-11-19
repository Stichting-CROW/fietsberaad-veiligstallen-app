FROM maven:3.8.8-eclipse-temurin-8 AS build
WORKDIR /src
COPY . .
RUN mvn -DskipTests -Dskip.unit.tests=true -Dskip.integration.tests=true package

FROM tomcat:8.5-jdk8-temurin
RUN rm -rf /usr/local/tomcat/webapps/*
COPY --from=build /src/target/bikepark.war /usr/local/tomcat/webapps/bikepark.war
EXPOSE 8080
