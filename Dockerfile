# Use an official Node LTS (Long Term Support) version as a parent image
FROM node:16

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Install any needed packages specified in package.json
RUN npm install

# Make port 3000 available to the world outside this container
EXPOSE 5002

# Define environment variable
ENV NODE_ENV=production

# Run index.js when the container launches
CMD ["node", "index.js"]

